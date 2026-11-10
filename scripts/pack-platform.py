from pathlib import Path
import json
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
output=root/f'deliverables/ai-platform-{version}.zip'
files=[root/x for x in ['package.json','README.md','PROJECT_CONTEXT.md','.env.example','.gitignore','start-platform.sh','start-platform.cmd']]
for folder in ['src','public','test','scripts','docs','design-system']:
    files.extend(p for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
files.append(root/'deliverables/历史交互原型_V1.html')
files.append(root/'deliverables/电商数字员工通用知识包_V0.14.md')
files.extend((root/'deliverables/知识库入门包_V0.14').glob('*.md'))
files.extend((root/'deliverables/企业知识资料_V0.16').glob('*.md'))
with ZipFile(output,'w',ZIP_DEFLATED) as z:
    z.write(root/'deliverables/ai-platform-preview.html','AI数字员工协作平台/先打开预览.html')
    for p in sorted(set(files)):
        z.write(p,'AI数字员工协作平台/'+str(p.relative_to(root)))
print(f'Created {output.name}: {output.stat().st_size} bytes; excludes runtime data, secrets, Git metadata and dependencies.')
