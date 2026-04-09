figma.showUI(__html__, { width: 360, height: 560 });

// ── Layout constants ──────────────────────────────────────────────────────────
const SECTION_W    = 5200;
const PAD          = 48;
const GAP          = 32;

// Image frames (9:16, displayed at ~300px wide)
const IMG_W        = 300;
const IMG_H        = 534;  // 300 * (16/9)
const IMG_GAP      = 16;
const IMG_COLS     = 8;

// Script column widths (3 columns inside script row)
const SCRIPT_INNER_W = (SECTION_W - PAD * 2 - GAP * 2) / 3; // ~1657px each

let sectionCount = 0;
let koreanFont: FontName = { family: 'Inter', style: 'Regular' };
let fontsLoaded = false;

// ── Colors ────────────────────────────────────────────────────────────────────
const C_BG         = { r: 0.102, g: 0.102, b: 0.102 }; // #1a1a1a section bg
const C_HOOK_BG    = { r: 0.063, g: 0.063, b: 0.063 }; // #101010 hook block
const C_CARD_BG    = { r: 0.149, g: 0.149, b: 0.149 }; // #262626 script cards
const C_MY_BG      = { r: 0.063, g: 0.118, b: 0.196 }; // #101e32 my script (blue tint)
const C_LABEL      = { r: 0.4,   g: 0.4,   b: 0.4   }; // #666 label text
const C_TEXT       = { r: 0.867, g: 0.867, b: 0.867 }; // #ddd body text
const C_HOOK_TEXT  = { r: 1,     g: 1,     b: 1     }; // #fff hook sentence
const C_ACCENT     = { r: 0.051, g: 0.6,   b: 1     }; // #0d99ff accent
const C_URL        = { r: 0.4,   g: 0.4,   b: 0.4   };

async function loadFonts() {
  if (fontsLoaded) return;
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  for (const font of [
    { family: 'Noto Sans KR', style: 'Regular' },
    { family: 'Apple SD Gothic Neo', style: 'Regular' },
  ]) {
    try {
      await figma.loadFontAsync(font);
      koreanFont = font;
      break;
    } catch { /* fallback to Inter */ }
  }
  fontsLoaded = true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRect(
  parent: FrameNode | PageNode,
  x: number, y: number, w: number, h: number,
  fill: RGB, radius = 0
): FrameNode {
  const f = figma.createFrame();
  f.resize(w, h);
  f.x = x; f.y = y;
  f.fills = [{ type: 'SOLID', color: fill }];
  f.cornerRadius = radius;
  parent.appendChild(f);
  return f;
}

function makeText(
  parent: FrameNode,
  x: number, y: number, w: number,
  content: string,
  size: number,
  color: RGB,
  font: FontName = { family: 'Inter', style: 'Regular' },
  autoResize: 'HEIGHT' | 'WIDTH_AND_HEIGHT' | 'NONE' = 'HEIGHT'
): TextNode {
  const t = figma.createText();
  t.fontName = font;
  t.fontSize = size;
  t.fills = [{ type: 'SOLID', color }];
  t.x = x; t.y = y;
  if (autoResize !== 'NONE') {
    t.textAutoResize = autoResize;
    t.resize(w, 100);
  } else {
    t.resize(w, size + 4);
  }
  t.characters = content;
  parent.appendChild(t);
  return t;
}

function makeLabel(parent: FrameNode, x: number, y: number, text: string): TextNode {
  return makeText(parent, x, y, 200, text, 11, C_LABEL,
    { family: 'Inter', style: 'Bold' }, 'NONE');
}

// ── Script card (원문 / 번역 / 내 대본) ───────────────────────────────────────
function makeScriptCard(
  parent: FrameNode,
  x: number, y: number, w: number,
  label: string, content: string,
  bgColor: RGB, font: FontName,
  minH = 200
): number {
  const INNER_PAD = 20;
  const card = makeRect(parent, x, y, w, minH, bgColor, 12);

  makeLabel(card, INNER_PAD, INNER_PAD, label);

  const bodyY = INNER_PAD + 18 + 8;
  const bodyW = w - INNER_PAD * 2;
  const body = makeText(card, INNER_PAD, bodyY, bodyW, content || '—', 14, C_TEXT, font);

  const totalH = Math.max(minH, bodyY + body.height + INNER_PAD);
  card.resize(w, totalH);
  return totalH;
}

// ── Storage: processed project IDs ───────────────────────────────────────────
async function getProcessed(): Promise<string[]> {
  return (await figma.clientStorage.getAsync('processedProjects')) || [];
}

async function saveProcessed(projectId: string) {
  const stored = await getProcessed();
  if (!stored.includes(projectId)) {
    await figma.clientStorage.setAsync('processedProjects', [...stored, projectId]);
  }
}

// ── Main message handler ──────────────────────────────────────────────────────
figma.ui.onmessage = async (msg) => {

  if (msg.type === 'get-unprocessed') {
    const stored = await getProcessed();
    const unprocessedIds = (msg.projectIds as string[]).filter(id => !stored.includes(id));
    figma.ui.postMessage({ type: 'unprocessed-result', unprocessedIds });
  }

  // ── Create storyboard section ─────────────────────────────────────────────
  else if (msg.type === 'create-project-section') {
    const { projectId, sourceUrl, hookSentence, originalScript, translatedScript, images } = msg;
    await loadFonts();

    const section = figma.createFrame();
    section.name = sourceUrl.replace(/https?:\/\/(www\.)?/, '').slice(0, 60);
    section.fills = [{ type: 'SOLID', color: C_BG }];
    section.cornerRadius = 16;
    section.resize(SECTION_W, 400); // temp height, resized at end

    let curY = PAD;

    // ── 1. Source URL ─────────────────────────────────────────────────────
    makeText(section, PAD, curY, SECTION_W - PAD * 2,
      sourceUrl, 12, C_URL, { family: 'Inter', style: 'Regular' }, 'NONE');
    curY += 18 + 16;

    // ── 2. Hook sentence block ────────────────────────────────────────────
    const HOOK_PAD = 24;
    const hookBlock = makeRect(section, PAD, curY, SECTION_W - PAD * 2, 80, C_HOOK_BG, 12);

    // accent left border
    const hookAccent = figma.createFrame();
    hookAccent.resize(4, 1); // height set after text
    hookAccent.x = 0; hookAccent.y = 0;
    hookAccent.fills = [{ type: 'SOLID', color: C_ACCENT }];
    hookBlock.appendChild(hookAccent);

    const hookLabel = makeLabel(hookBlock, HOOK_PAD, HOOK_PAD, 'HOOK');
    const hookText = makeText(
      hookBlock, HOOK_PAD, HOOK_PAD + hookLabel.height + 8,
      SECTION_W - PAD * 2 - HOOK_PAD * 2,
      hookSentence || '—', 22, C_HOOK_TEXT,
      { family: 'Inter', style: 'Bold' }
    );
    const hookH = HOOK_PAD + hookLabel.height + 8 + hookText.height + HOOK_PAD;
    hookBlock.resize(SECTION_W - PAD * 2, hookH);
    hookAccent.resize(4, hookH);
    curY += hookH + GAP;

    // ── 3. Script row: 원문 | 한글 번역 | 내 대본 ─────────────────────────
    const scriptCardH = makeScriptCard(
      section, PAD, curY, SCRIPT_INNER_W,
      'ORIGINAL SCRIPT', originalScript || '—',
      C_CARD_BG, { family: 'Inter', style: 'Regular' }
    );
    const translateCardH = makeScriptCard(
      section, PAD + SCRIPT_INNER_W + GAP, curY, SCRIPT_INNER_W,
      '한글 번역 (톤앤매너 유지)', translatedScript || '—',
      C_CARD_BG, koreanFont
    );
    makeScriptCard(
      section, PAD + (SCRIPT_INNER_W + GAP) * 2, curY, SCRIPT_INNER_W,
      '내 대본 (직접 작성)',
      '',
      C_MY_BG, koreanFont,
      Math.max(scriptCardH, translateCardH)
    );
    curY += Math.max(scriptCardH, translateCardH) + GAP;

    // ── 4. Frames section label ───────────────────────────────────────────
    makeLabel(section, PAD, curY, 'FRAMES');
    curY += 18 + 12;

    // Grid frame placeholder (images added via add-frame-to-section)
    const gridFrame = figma.createFrame();
    gridFrame.name = '_grid';
    gridFrame.fills = [];
    gridFrame.resize(1, 1);
    gridFrame.x = PAD;
    gridFrame.y = curY;
    section.appendChild(gridFrame);

    section.resize(SECTION_W, curY + 1 + PAD);
    section.x = figma.viewport.center.x - SECTION_W / 2;
    section.y = figma.viewport.center.y + sectionCount * (section.height + 120);
    sectionCount++;

    figma.currentPage.appendChild(section);
    figma.viewport.scrollAndZoomIntoView([section]);
    await saveProcessed(projectId);

    const fileKey = figma.fileKey;
    const figmaUrl = fileKey
      ? `https://www.figma.com/file/${fileKey}?node-id=${encodeURIComponent(section.id)}`
      : null;

    figma.ui.postMessage({
      type: 'section-created',
      projectId, sectionId: section.id, gridFrameId: gridFrame.id, figmaUrl,
      images: images || [],
    });
  }

  // ── Add frame to grid ─────────────────────────────────────────────────────
  else if (msg.type === 'add-frame-to-section') {
    const { frame, sectionId, gridFrameId } = msg;
    figma.ui.postMessage({
      type: 'fetch-image-for-grid',
      url: frame.storage_url, frame, sectionId, gridFrameId,
    });
  }

  else if (msg.type === 'image-fetched-for-grid') {
    const { bytes, frame, sectionId, gridFrameId } = msg;

    const gridFrame = figma.getNodeById(gridFrameId) as FrameNode;
    const section   = figma.getNodeById(sectionId)   as FrameNode;
    if (!gridFrame || !section) {
      figma.ui.postMessage({ type: 'frame-add-error', message: '섹션이 캔버스에서 삭제되었습니다.' });
      return;
    }

    const count = gridFrame.children.length;
    const col   = count % IMG_COLS;
    const row   = Math.floor(count / IMG_COLS);

    const imgNode = figma.createFrame();
    imgNode.name = `${frame.timestamp_seconds}s`;
    imgNode.resize(IMG_W, IMG_H);
    imgNode.cornerRadius = 8;
    imgNode.x = col * (IMG_W + IMG_GAP);
    imgNode.y = row * (IMG_H + IMG_GAP);

    const image = figma.createImage(new Uint8Array(bytes));
    imgNode.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];

    // timestamp label below image
    const tsLabel = figma.createText();
    tsLabel.fontName = { family: 'Inter', style: 'Regular' };
    tsLabel.fontSize = 11;
    tsLabel.fills = [{ type: 'SOLID', color: C_LABEL }];
    tsLabel.characters = `${frame.timestamp_seconds}s`;
    tsLabel.textAutoResize = 'WIDTH_AND_HEIGHT';
    tsLabel.x = 4;
    tsLabel.y = IMG_H + 4;
    imgNode.appendChild(tsLabel);

    gridFrame.appendChild(imgNode);

    const newCount  = count + 1;
    const totalCols = Math.min(newCount, IMG_COLS);
    const totalRows = Math.ceil(newCount / IMG_COLS);
    gridFrame.resize(
      totalCols * IMG_W + (totalCols - 1) * IMG_GAP,
      totalRows * (IMG_H + 20) + (totalRows - 1) * IMG_GAP
    );
    section.resize(SECTION_W, gridFrame.y + gridFrame.height + PAD);

    figma.ui.postMessage({ type: 'frame-added' });
  }

  // ── Bulk frames (all at once after section creation) ──────────────────────
  else if (msg.type === 'bulk-images-fetched') {
    const { images, sectionId, gridFrameId } = msg;
    const gridFrame = figma.getNodeById(gridFrameId) as FrameNode;
    const section   = figma.getNodeById(sectionId)   as FrameNode;
    if (!gridFrame || !section) return;

    for (let i = 0; i < images.length; i++) {
      const { bytes, frame } = images[i];
      const col = i % IMG_COLS;
      const row = Math.floor(i / IMG_COLS);

      const imgNode = figma.createFrame();
      imgNode.name = `${frame.timestamp_seconds}s`;
      imgNode.resize(IMG_W, IMG_H);
      imgNode.cornerRadius = 8;
      imgNode.x = col * (IMG_W + IMG_GAP);
      imgNode.y = row * (IMG_H + IMG_GAP);

      const image = figma.createImage(new Uint8Array(bytes));
      imgNode.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];

      const tsLabel = figma.createText();
      tsLabel.fontName = { family: 'Inter', style: 'Regular' };
      tsLabel.fontSize = 11;
      tsLabel.fills = [{ type: 'SOLID', color: C_LABEL }];
      tsLabel.characters = `${frame.timestamp_seconds}s`;
      tsLabel.textAutoResize = 'WIDTH_AND_HEIGHT';
      tsLabel.x = 4;
      tsLabel.y = IMG_H + 4;
      imgNode.appendChild(tsLabel);

      gridFrame.appendChild(imgNode);
    }

    const total     = images.length;
    const totalCols = Math.min(total, IMG_COLS);
    const totalRows = Math.ceil(total / IMG_COLS);
    gridFrame.resize(
      totalCols * IMG_W + (totalCols - 1) * IMG_GAP,
      totalRows * (IMG_H + 20) + (totalRows - 1) * IMG_GAP
    );
    section.resize(SECTION_W, gridFrame.y + gridFrame.height + PAD);

    figma.ui.postMessage({ type: 'bulk-frames-added' });
  }
};
