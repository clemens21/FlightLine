from __future__ import annotations

import html
import json
import re
import time
import urllib.parse
import urllib.request
from urllib.error import HTTPError
from pathlib import Path


USER_AGENT = "FlightLineDev/1.0 (local development)"
REPO_ROOT = Path(__file__).resolve().parents[2]
IMAGE_DIRECTORY = REPO_ROOT / "data" / "aircraft" / "images" / "families"
CATALOG_PATH = REPO_ROOT / "src" / "ui" / "aircraft-image-catalog.ts"

FAMILY_SOURCES = {
    "caravan": {"article_title": "Cessna 208 Caravan"},
    "skycourier": {"article_title": "Cessna 408 SkyCourier"},
    "pc12": {"article_title": "Pilatus PC-12"},
    "citation_cj": {"article_title": "Cessna Citation family"},
    "citation_longitude": {"article_title": "Cessna Citation Longitude"},
    "pc24": {"article_title": "Pilatus PC-24"},
    "twin_otter": {"article_title": "De Havilland Canada DHC-6 Twin Otter"},
    "skyvan": {"article_title": "Short SC.7 Skyvan"},
    "ys11": {"article_title": "NAMC YS-11"},
    "saab340": {"article_title": "Saab 340"},
    "beech1900": {"article_title": "Beechcraft 1900"},
    "jetstream32": {"article_title": "British Aerospace Jetstream"},
    "emb120": {"article_title": "Embraer EMB 120 Brasilia"},
    "dash8": {"article_title": "De Havilland Canada Dash 8"},
    "atr": {"article_title": "ATR 72"},
    "crj": {"article_title": "Bombardier CRJ700 series"},
    "erj145": {"article_title": "Embraer ERJ family"},
    "ejet": {"article_title": "Embraer E-Jet family"},
    "f28": {"article_title": "Fokker F28 Fellowship"},
    "bae146": {"commons_file_title": "File:British Aerospace 146-100 ‘G-JEAO’ (50120296542).jpg"},
    "avro_rj": {"commons_file_title": "File:Avro RJ85.jpg"},
    "a310": {"article_title": "Airbus A310"},
    "a320_family": {"article_title": "Airbus A320 family"},
    "a220": {"article_title": "Airbus A220"},
    "b737": {"article_title": "Boeing 737"},
    "a330": {"article_title": "Airbus A330"},
    "a350": {"article_title": "Airbus A350"},
    "b747": {"article_title": "Boeing 747"},
    "b787": {"article_title": "Boeing 787 Dreamliner"},
    "b767": {"article_title": "Boeing 767"},
    "b777": {"article_title": "Boeing 777"},
    "a300": {"article_title": "Airbus A300"},
}


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request) as response:
                return response.read()
        except HTTPError as error:
            if error.code == 429 and attempt < 4:
                time.sleep(2 + attempt * 2)
                continue
            raise
    raise RuntimeError(f"Unable to fetch {url}")


def fetch_json(url: str) -> dict[str, object]:
    return json.loads(fetch_bytes(url).decode("utf-8"))


def download_file(url: str, destination: Path) -> None:
    destination.write_bytes(fetch_bytes(url))


def strip_html(raw_value: str | None) -> str:
    if not raw_value:
        return ""
    without_tags = re.sub(r"<[^>]+>", "", raw_value)
    normalized = without_tags.replace("\n", " ").replace("\r", " ")
    return html.unescape(re.sub(r"\s+", " ", normalized)).strip()


def page_image_for_article(article_title: str) -> dict[str, str]:
    encoded_title = urllib.parse.quote(article_title, safe="")
    data = fetch_json(
        "https://en.wikipedia.org/w/api.php"
        f"?action=query&titles={encoded_title}&prop=pageimages&format=json"
        "&piprop=thumbnail|name|original&pithumbsize=1100"
    )
    page = next(iter(data["query"]["pages"].values()))
    thumbnail = page.get("thumbnail")
    original = page.get("original")
    page_image = page.get("pageimage")

    if not thumbnail or not original or not page_image:
        raise RuntimeError(f"No usable page image found for article '{article_title}'.")

    return {
        "file_title": f"File:{page_image}",
        "thumbnail_url": thumbnail["source"],
        "original_url": original["source"],
    }


def commons_metadata(file_title: str) -> dict[str, str]:
    encoded_file = urllib.parse.quote(file_title, safe=":")
    data = fetch_json(
        "https://commons.wikimedia.org/w/api.php"
        f"?action=query&titles={encoded_file}&prop=imageinfo&iiprop=url|extmetadata&format=json"
    )
    page = next(iter(data["query"]["pages"].values()))
    image_info = page.get("imageinfo", [{}])[0]
    metadata = image_info.get("extmetadata", {})

    return {
        "description_url": image_info.get("descriptionurl", ""),
        "license_name": strip_html(metadata.get("LicenseShortName", {}).get("value")),
        "license_url": strip_html(metadata.get("LicenseUrl", {}).get("value")),
        "artist": strip_html(metadata.get("Artist", {}).get("value")),
        "credit": strip_html(metadata.get("Credit", {}).get("value")),
        "object_name": strip_html(metadata.get("ObjectName", {}).get("value")),
    }


def commons_image_by_title(file_title: str) -> dict[str, str]:
    encoded_file = urllib.parse.quote(file_title, safe=":")
    data = fetch_json(
        "https://commons.wikimedia.org/w/api.php"
        f"?action=query&titles={encoded_file}&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1100&format=json"
    )
    page = next(iter(data["query"]["pages"].values()))
    image_info = page.get("imageinfo", [{}])[0]
    thumbnail_url = image_info.get("thumburl") or image_info.get("url")
    original_url = image_info.get("url")

    if not thumbnail_url or not original_url:
        raise RuntimeError(f"No downloadable Commons image found for '{file_title}'.")

    return {
        "file_title": page.get("title", file_title),
        "thumbnail_url": thumbnail_url,
        "original_url": original_url,
    }


def extension_for_url(url: str) -> str:
    path = urllib.parse.urlparse(url).path.lower()
    if path.endswith(".png"):
        return ".png"
    if path.endswith(".webp"):
        return ".webp"
    return ".jpg"


def build_catalog_entry(family_id: str, source: dict[str, str]) -> dict[str, str]:
    article_title = source.get("article_title")
    image_data = page_image_for_article(article_title) if article_title else commons_image_by_title(source["commons_file_title"])
    metadata = commons_metadata(image_data["file_title"])
    extension = extension_for_url(image_data["thumbnail_url"])
    file_name = f"{family_id}{extension}"
    destination = IMAGE_DIRECTORY / file_name
    IMAGE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    download_file(image_data["thumbnail_url"], destination)

    attribution = metadata["artist"] or metadata["credit"] or "Wikimedia Commons contributor"
    title = metadata["object_name"] or article_title or family_id.replace("_", " ").title()

    return {
        "familyId": family_id,
        "assetPath": f"/assets/aircraft-images/{file_name}",
        "title": title,
        "attribution": attribution,
        "license": metadata["license_name"] or "Open license",
        "licenseUrl": metadata["license_url"],
        "sourceUrl": metadata["description_url"] or image_data["original_url"],
    }


def write_catalog(entries: list[dict[str, str]]) -> None:
    lines = [
        "/*",
        " * Generated by scripts/aircraft/fetch_family_images.py.",
        " * Maps aircraft families to locally cached Wikimedia Commons images and attribution data.",
        " */",
        "",
        "export interface AircraftImageCatalogEntry {",
        "  assetPath: string;",
        "  title: string;",
        "  attribution: string;",
        "  license: string;",
        "  licenseUrl?: string;",
        "  sourceUrl?: string;",
        "}",
        "",
        "export const aircraftImageCatalog = {",
    ]

    for entry in entries:
        lines.extend(
            [
                f'  "{entry["familyId"]}": {{',
                f'    assetPath: "{entry["assetPath"]}",',
                f'    title: {json.dumps(entry["title"])},',
                f'    attribution: {json.dumps(entry["attribution"])},',
                f'    license: {json.dumps(entry["license"])},',
                f'    licenseUrl: {json.dumps(entry["licenseUrl"])},',
                f'    sourceUrl: {json.dumps(entry["sourceUrl"])},',
                "  },",
            ]
        )

    lines.extend(
        [
            "} as const satisfies Record<string, AircraftImageCatalogEntry>;",
            "",
            'export const aircraftImageFallbackPath = "/assets/aircraft-images/fallback.svg";',
            "",
        ]
    )

    CATALOG_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    entries: list[dict[str, str]] = []
    for family_id, source in FAMILY_SOURCES.items():
        source_label = source.get("article_title") or source.get("commons_file_title") or family_id
        print(f"Fetching {family_id} from {source_label}...")
        entries.append(build_catalog_entry(family_id, source))
        time.sleep(1)

    write_catalog(entries)
    print(f"Wrote {len(entries)} aircraft family images to {IMAGE_DIRECTORY}")


if __name__ == "__main__":
    main()
