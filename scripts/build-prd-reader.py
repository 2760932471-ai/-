"""Render the supported Markdown used by this PRD into a portable review document.
No network dependencies. The Markdown remains the source of truth.
"""
from pathlib import Path
import html
import re
import base64

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/AI数字员工协作工作台_PRD_V1.1.md'
RESEARCH = ROOT / 'docs/research/PRD公开资料检索记录_2026-11-05.md'
text = SOURCE.read_text()
esc = html.escape

def inline(value):
    value = esc(value)
    value = re.sub(r'`([^`]+)`', r'<code>\1</code>', value)
    value = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', value)
    value = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', lambda m: '<a href="'+('#research' if m[2].startswith('research/') else m[2])+'">'+m[1]+'</a>', value)
    return value

def flow_svg():
    nodes = {
        'A':(20,20,'人：描述目标、选团队'), 'B':(340,20,'范围和交付明确？'),
        'C':(660,20,'人：补充，或保存待补充目标'), 'D':(340,130,'必要事实齐全且确认？'),
        'E':(660,130,'AI列缺项；人核对资料'), 'F':(340,240,'AI提出计划；人确认版本'),
        'G':(340,350,'AI自动准备草案并检查条件'), 'H':(340,460,'是否约定外部发布？'),
        'I':(660,460,'人：审批精确版本与动作'), 'J':(660,570,'系统：重校验并提交一次'),
        'K':(660,680,'回读是否一致？'), 'L':(980,680,'查原请求或人工处理'),
        'M':(660,790,'AI观察数据并形成复盘'), 'N':(340,790,'人：验收交付或要求补充'),
        'O':(20,790,'目标结束，经营达标单列')}
    paths = [
      ('M280 50H340',''),('M600 50H660','不明确'),('M470 80V130','明确'),
      ('M600 160H660','缺失/冲突'),('M470 190V240','通过'),('M470 300V350',''),
      ('M470 410V460',''),('M600 490H660','发布'),('M470 520V790','只交草案/分析'),
      ('M790 520V570','批准'),('M790 630V680',''),('M920 710H980','未知/差异'),
      ('M790 740V790','一致'),('M660 820H600',''),('M340 820H280','验收'),
      ('M790 20V5H470V20',''),('M790 130V115H470V130',''),
      ('M790 460V325H600V270','退回/修改'),
      ('M1110 740V770H930V710H920','重查'),
      ('M340 820H310V270H340','要求补充')]
    out=['<div class="diagram" role="img" aria-label="目标协作流程：人确认范围、事实、计划和授权，系统自动推进准备与核验，异常回到对应处理环节。横向滚动可查看完整流程。"><svg viewBox="0 0 1270 870" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#8492a9"/></marker></defs>']
    for d,label in paths:
        out.append(f'<path d="{d}" fill="none" stroke="#8492a9" stroke-width="1.5" marker-end="url(#arrow)"/>')
    for key,(x,y,label) in nodes.items():
        out.append(f'<rect x="{x}" y="{y}" width="260" height="60" rx="9" fill="'+('#eef3ff' if key in ['A','F','I','N'] else '#fff')+'" stroke="#c6d1e1"/>')
        out.append(f'<text x="{x+130}" y="{y+35}" text-anchor="middle" fill="#263247" font-family="sans-serif" font-size="14">{esc(label)}</text>')
    labels=[(615,40,'不明确'),(480,107,'明确'),(611,150,'缺失/冲突'),(480,219,'通过'),(616,480,'发布'),(480,630,'只交草案/分析'),(800,548,'批准'),(935,697,'未知/差异'),(800,770,'一致'),(285,805,'验收'),(935,757,'重查'),(613,335,'退回/修改'),(221,560,'要求补充')]
    for x,y,label in labels:out.append(f'<text x="{x}" y="{y}" fill="#546680" font-family="sans-serif" font-size="12">{esc(label)}</text>')
    out.append('</svg></div><p class="caption">蓝底节点需要人确认；其余步骤按已确认范围自动推进。流程图可横向滚动，具体条件以各节规格为准。</p>')
    return ''.join(out)

headings=[]

def render(md,prefix='s'):
    lines=md.splitlines();out=[];i=0;section=0
    while i<len(lines):
        line=lines[i]
        if not line.strip(): i+=1;continue
        if line.startswith('```'):
            lang=line[3:].strip();buf=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):buf.append(lines[i]);i+=1
            out.append(flow_svg() if lang=='mermaid' else '<pre><code>'+esc('\n'.join(buf))+'</code></pre>');i+=1;continue
        h=re.match(r'^(#{1,6}) (.+)$',line)
        if h:
            level=len(h[1]);section+=1;ident=f'{prefix}-{section}'
            if level==2 and prefix=='s':headings.append((ident,h[2]))
            out.append(f'<h{level} id="{ident}">{inline(h[2])}</h{level}>');i+=1;continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].startswith('|'):
                cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?',c.replace(' ','')) for c in cells):rows.append(cells)
                i+=1
            out.append('<div class="table-wrap" tabindex="0" aria-label="可横向滚动的规格表"><table>')
            for r,cells in enumerate(rows):
                tag='th' if r==0 else 'td'
                if r==0:out.append('<thead>')
                elif r==1:out.append('<tbody>')
                out.append('<tr>'+''.join(f'<{tag}'+(' scope="col"' if r==0 else '')+'>'+inline(c)+f'</{tag}>' for c in cells)+'</tr>')
                if r==0:out.append('</thead>')
            if len(rows)>1:out.append('</tbody>')
            out.append('</table></div>');continue
        match=re.match(r'^(?:([-*])|(\d+)\.) (.+)$',line)
        if match:
            ordered=bool(match[2]);tag='ol' if ordered else 'ul';out.append(f'<{tag}>')
            pattern=r'^\d+\. (.+)$' if ordered else r'^[-*] (.+)$'
            while i<len(lines):
                m=re.match(pattern,lines[i])
                if not m:break
                out.append('<li>'+inline(m[1])+'</li>');i+=1
            out.append(f'</{tag}>');continue
        if line.strip()=='---':out.append('<hr>');i+=1;continue
        if line.startswith('> '):out.append('<blockquote>'+inline(line[2:])+'</blockquote>');i+=1;continue
        paragraph=[line];i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||```|[-*] |\d+\. |---|> )',lines[i]):paragraph.append(lines[i]);i+=1
        out.append('<p>'+inline('\n'.join(paragraph))+'</p>')
    return '\n'.join(out)

body=render(text)
research=render(RESEARCH.read_text().replace('# PRD公开资料检索记录','### 检索方法与结果',1),'r')
nav=''.join(f'<a href="#{ident}">{esc(title)}</a>' for ident,title in headings)
payload=base64.b64encode(text.encode()).decode()
css='''
:root{color-scheme:light;font:16px/1.85 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#26303f;background:#f6f7f9}*{box-sizing:border-box}body{margin:0}a{color:#315ddd;text-decoration:none}a:hover{text-decoration:underline}a:focus-visible,summary:focus-visible,.table-wrap:focus-visible{outline:2px solid #315ddd;outline-offset:3px}header{padding:18px 32px;background:white;border-bottom:1px solid #e1e5ec;display:flex;justify-content:space-between;gap:16px;font-size:13px}header strong{font-weight:600}header a{white-space:nowrap}.layout{display:grid;grid-template-columns:260px minmax(0,1120px);max-width:1440px;margin:0 auto;align-items:start}aside{padding:24px 14px 24px 24px;position:sticky;top:0;max-height:100vh;overflow:auto}summary{font-weight:600;font-size:14px;cursor:pointer}nav{display:flex;flex-direction:column;gap:3px;margin-top:14px}nav a{padding:7px 10px;color:#576278;font-size:12px;border-radius:6px}nav a:hover{background:#eaf0fd;color:#315ddd;text-decoration:none}main{min-width:0;background:white;padding:44px 52px 80px;border-left:1px solid #e3e7ed;border-right:1px solid #e3e7ed}h1{font-size:30px;line-height:1.45;margin:0 0 24px;letter-spacing:-.5px}h2{font-size:24px;line-height:1.5;margin:64px 0 24px;padding-top:20px;border-top:1px solid #dce3ee}h3{font-size:18px;line-height:1.6;margin:34px 0 16px}h1,h2,h3{scroll-margin-top:24px}p{margin:15px 0}strong{font-weight:650}li{margin:7px 0}ul,ol{padding-left:24px}.table-wrap{overflow-x:auto;margin:20px 0 26px;border:1px solid #dfe5ee;border-radius:8px}table{border-collapse:collapse;width:100%;font-size:13px;line-height:1.8;min-width:680px}th,td{text-align:left;vertical-align:top;padding:13px 14px;border-bottom:1px solid #e5eaf1;min-width:95px;overflow-wrap:anywhere}th{background:#f2f5fa;color:#3c4c64;font-weight:600}td:first-child{font-weight:500}tr:last-child td{border-bottom:0}tr:nth-child(even){background:#fcfdff}code{font-family:ui-monospace,monospace;font-size:.88em;background:#f2f4f8;padding:2px 5px;border-radius:4px;overflow-wrap:anywhere}pre{white-space:pre-wrap}blockquote{border-left:3px solid #315ddd;padding-left:18px;color:#5c687b}hr{border:0;border-top:1px solid #e3e8ef;margin:32px 0}.diagram{overflow:auto;border:1px solid #dfe5ee;border-radius:9px;background:#fbfcff;padding:12px}.diagram svg{display:block;width:1100px;max-width:none}.caption{font-size:12px;color:#647188}.download-note{font-size:12px;color:#687387;margin:16px 10px}.research-box{margin-top:64px}.research-box>h2{margin-top:24px}.research-box h1{font-size:22px}.back{position:fixed;right:16px;bottom:16px;background:#fff;border:1px solid #d7deeb;padding:9px 12px;border-radius:7px;font-size:12px}@media(max-width:900px){.layout{display:block}aside{position:static;max-height:none;padding:15px 20px;border-bottom:1px solid #e2e6ed}nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:28px 20px;border:0}h1{font-size:25px}h2{font-size:21px;margin-top:44px}header{padding:14px 20px;font-size:11px;align-items:center}.download-note{display:none}}@media print{aside,header,.back{display:none}main{padding:0;border:0;max-width:none}.layout{display:block}h2{break-before:page;margin-top:0}.table-wrap{overflow:visible;border-radius:0}table{min-width:0;font-size:9pt}tr{break-inside:avoid}.diagram{overflow:visible}.diagram svg{width:100%;height:auto}a{color:inherit}body{background:#fff;font-size:11pt}h1{font-size:24pt}}
'''
page=f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI数字员工协作工作台 PRD V1.1 · 功能与交互规格</title><style>{css}</style></head><body id="top"><header><strong>AI数字员工协作工作台 · 产品需求文档</strong><a download="AI数字员工协作工作台_PRD_V1.1.md" href="data:text/markdown;charset=utf-8;base64,{payload}">下载 Markdown 原文 ↓</a></header><div class="layout"><aside><details open><summary>文档目录 · V1.1</summary><nav aria-label="文档章节">{nav}<a href="#research">附：公开资料检索记录</a></nav></details><p class="download-note">本文件可离线打开。<br>浏览器查找：Ctrl / ⌘ + F<br>可打印或另存为 PDF。</p></aside><main>{body}<section id="research" class="research-box"><h2>附：公开资料检索记录</h2>{research}</section></main></div><a class="back" href="#top">回到顶部 ↑</a></body></html>'''
output=ROOT/'deliverables/AI数字员工协作工作台_PRD_V1.1.html'
output.write_text(page)
print(f'Generated {output.name}: {len(page.encode())} bytes, {len(headings)} TOC entries')
