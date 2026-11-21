from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo

root = Path(__file__).resolve().parents[1]
with ZipFile(root / 'public/cloud-browser.zip', 'w') as archive:
    for path in sorted((root / 'browser-connector').iterdir()):
        archive.writestr(ZipInfo(path.name), path.read_bytes(), compress_type=ZIP_DEFLATED)
