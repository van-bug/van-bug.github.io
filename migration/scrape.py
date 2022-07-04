import datetime
import json
import os
import re
import subprocess
from time import strptime

import requests
import requests_cache
from bs4 import BeautifulSoup, SoupStrainer
from markdownify import MarkdownConverter

# globally cache requests
requests_cache.install_cache(
    '.requests_cache',
    urls_expire_after={
        'http://vanbug.org*': 4 * 60 * 60 * 24 * 30,  # 4 months
    },
)

KNOWN_DATES = {
    'http://www.vanbug.org/2018/mike-farmulare/': '2018-05-10',
    'http://www.vanbug.org/2018/jared-simpson/': '2018-04-12',
    'http://www.vanbug.org/2018/faraz-hach/': '2018-02-08',
    'http://www.vanbug.org/2018/january-11th-special-event/': '2018-01-11',
    'http://www.vanbug.org/2014/michel-dumontier/': '2014-03-13',
    'http://www.vanbug.org/2014/gene-myers/': '2014-02-06',
    'http://www.vanbug.org/2010/richard-bonneau/': '2010-03-11',
    'http://www.vanbug.org/2010/evan-eichler/': '2010-01-13',
    'http://www.vanbug.org/2009/sohrab-shah/': '2009-11-26',
    'http://www.vanbug.org/2009/chris-shaw/': '2009-10-08',
    'http://www.vanbug.org/2009/rbrinkman_sept09/': '2009-09-10',
    'http://www.vanbug.org/2007/irmtraud-meyer/': '2007-01-11',
    'http://www.vanbug.org/2011/careers-in-bioinformatics/': '2011-04-14',
    'http://www.vanbug.org/2003/season-end-celebration/': '2003-05-13',
}


def ordinal_suffix_of(num):
    j = num % 10
    k = num % 100
    if j == 1 and k != 11:
        return "st"

    if j == 2 and k != 12:
        return "nd"
    if j == 3 and k != 13:
        return "rd"
    return "th"


def scrape_date(text):
    all_dates = set()
    for date_match in re.finditer(r'([A-Za-z]+)\.? ([0-9][0-9]?)\w*,? (20[0-9][0-9])', text):
        try:
            month = strptime(date_match.group(1), '%B').tm_mon
        except ValueError:
            try:
                month = strptime(date_match.group(1), '%b').tm_mon
            except ValueError:
                month = strptime(date_match.group(1)[:3], '%b').tm_mon
        all_dates.add(f'{date_match.group(3)}-{month:>02d}-{int(date_match.group(2)):>02d}')
    return all_dates


def parse_archive_page(page_url):
    response = requests.get(page_url)
    soup = BeautifulSoup(response.text, features="html.parser")
    div = soup.find("div", {"id": "content"})
    h2 = soup.find('h2')
    h2.extract()
    iframe = soup.find('iframe')
    if iframe:
        iframe.extract()
    md = MarkdownConverter(heading_style='ATX', bullets='-+*').convert_soup(div)

    event_details = []

    metadata = {'speaker': h2.text.strip()}

    lines = [f'**Speaker**: {h2.text}', '']

    inside_section = ''
    title_pos = None
    for i, line in enumerate(md.split('\n')):
        if line.startswith('#') or line.startswith('**'):
            if 'talk title' in inside_section.lower() and iframe and title_pos is None:
                # after the title
                title_pos = i - 1
            inside_section = line

        if any(part in inside_section.lower() for part in ['location', 'date', 'time']):
            event_details.append(i)
        lines.append(line.strip())

    if event_details:
        admonition = ['', '!!! info "Event Details"']
        for line_i in range(min(event_details), max(event_details) + 1):
            admonition.append('    ' + lines[line_i])
        admonition.append('')
        lines = lines[: min(event_details)] + admonition + lines[max(event_details) + 1 :]

    if iframe and title_pos:
        lines = (
            lines[: title_pos + 1]
            + ['', f'![type:video]({iframe["src"]})', '']
            + lines[title_pos + 1 :]
        )

    md = '\n'.join(lines)
    md = re.sub(r'(——————————|———)', '', md)
    md = re.sub(r'\n– ', '\n- ', md, flags=re.IGNORECASE | re.MULTILINE)
    md = re.sub(r'\n\n\n*', '\n\n', md, flags=re.IGNORECASE | re.MULTILINE)
    md = re.sub(r'(\*\*Location:?\*\*)', r':material-map-marker: \1', md, re.IGNORECASE)
    md = re.sub(r'@( \d+:\d+(am|pm))', r':material-clock:\1', md, re.IGNORECASE)
    md = re.sub(
        r'(\*\*(Affiliation|Talk Title|Title of talk|Title|Introductory Speaker|Student Speaker|Webcast Link|URL|Presentation):?\*\*:?)\n\n*',
        r'\1 ',
        md,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    md = re.sub(
        r'(\*\*(Introductory|Student) Speaker:?\*\*)',
        r'---\n\n\1',
        md,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    md = re.sub(
        r'!\[PPT\]\(/images/ppt\.gif\)',
        ':material-file-powerpoint-box:',
        md,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    md = re.sub(
        r'!\[PDF\]\(/images/pdf\.gif\)',
        ':material-file-pdf-box:',
        md,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    return md, metadata


def pull_content_links(md, date_name):
    """
    Scrape  any links to PDF/PPT hosted currently under vanbug.org
    """
    links = []
    for link in re.finditer(r'\((/|(http://)?(www\.)?vanbug\.org)[^)]+(pdf|pptx?)\)', md):
        link = link.group(0)[1:-1]
        links.append(link)

    prefixes = set()
    links_mapping = {}

    for link in links:
        ext = link.split('.')[-1]
        prefix = link[: len(link) - len(ext)].replace('www.', '').replace('http://', '')
        prefixes.add(prefix)
        links_mapping[link] = f'vanbug-{date_name}-{len(prefixes)}.{ext}'
    return links_mapping


def main():
    response = requests.get('http://www.vanbug.org/meeting_archives/')

    scraping_fails = []
    redirects = {}

    with open('gdrive_mapping.json', 'r') as fh:
        gdrive_mapping = json.load(fh)

    for link in BeautifulSoup(response.text, parse_only=SoupStrainer('a'), features="html.parser"):
        if link.has_attr('href') and re.match(r'.*/20[0-9][0-9]/.*', link['href']):
            print('processing:', link['href'].strip())
            md, metadata = parse_archive_page(link['href'])
            dates = scrape_date(md)

            if len(dates) == 1:
                date_name = list(dates)[0]
            elif link['href'] in KNOWN_DATES:
                date_name = KNOWN_DATES[link['href']]
            else:
                scraping_fails.append((link['href'], dates))
                continue

            year, month, day = date_name.split('-')
            month = datetime.date(int(year), int(month), int(day)).strftime('%b')

            for old_link, new_filename in pull_content_links(md, date_name).items():
                gid = gdrive_mapping[new_filename]
                new_link = f'https://drive.google.com/file/d/{gid}/view?usp=sharing'
                md = md.replace(f'({old_link})', f'({new_link})')

            os.makedirs(f'src/archive/{year}', exist_ok=True)
            new_link_path = f'src/archive/{year}/{date_name}.md'
            with open(new_link_path, 'w') as fh:
                fh.write(f'# {month} - {metadata["speaker"]}\n\n' + md)

            redirects[link['href']] = new_link_path

    print('\nthe following pages had errors scraping their dates\n')

    for page in scraping_fails:
        print(page)
    print()

    with open('redirects.txt', 'w') as fh:
        for link, md_file in redirects.items():
            link = re.sub('^.*vanbug.org', '', link)
            fh.write(f'{link}: {md_file}\n')


def scrape_grive_filenames():
    gdrive_mapping = {}
    with open('gdrive_data.html', 'r') as fh:
        soup = BeautifulSoup(fh.read(), features="html.parser")
        for tag in soup.find_all('div', {'data-target': "doc"}):
            if not tag.has_attr('data-id'):
                print(dir(tag))
                continue
            text = re.sub(r'[\n\s]+', ' ', tag.getText())
            match = re.search(r'vanbug-\d+-\d+-\d+-\d+\.(pdf|ppt)', text)
            if not match:
                continue
            filename = match.group(0)
            gdrive_mapping[filename] = tag['data-id']

    with open('gdrive_mapping.json', 'w') as fh:
        fh.write(json.dumps(gdrive_mapping, sort_keys=True, indent='  '))


if __name__ == '__main__':
    main()
