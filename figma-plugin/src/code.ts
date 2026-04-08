figma.showUI(__html__, { width: 360, height: 560 });

const GRID_COLS = 8;
const IMG_W = 720;
const IMG_H = 1280;
const IMG_GAP = 24;
const PAD = 36;
const SECTION_W = 6000;
const SCRIPT_COL_W = (SECTION_W - PAD * 2 - 24) / 2; // 2952

let sectionCount = 0;
let koreanFont: FontName = { family: 'Inter', style: 'Regular' };
let fontsLoaded = false;

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

async function getProcessed(): Promise<string[]> {
  return (await figma.clientStorage.getAsync('processedProjects')) || [];
}

async function saveProcessed(projectId: string) {
  const stored = await getProcessed();
  if (!stored.includes(projectId)) {
    await figma.clientStorage.setAsync('processedProjects', [...stored, projectId]);
  }
}

figma.ui.onmessage = async (msg) => {

  // UI asks: which of these project IDs haven't been rendered yet?
  if (msg.type === 'get-unprocessed') {
    const stored = await getProcessed();
    const unprocessedIds = (msg.projectIds as string[]).filter(id => !stored.includes(id));
    figma.ui.postMessage({ type: 'unprocessed-result', unprocessedIds });
  }

  else if (msg.type === 'create-project-section') {
    const { projectId, sourceUrl, originalScript, translatedScript } = msg;
    await loadFonts();

    const section = figma.createFrame();
    section.name = sourceUrl.replace(/https?:\/\/(www\.)?/, '').slice(0, 60);
    section.fills = [{ type: 'SOLID', color: { r: 0.102, g: 0.102, b: 0.102 } }];
    section.cornerRadius = 16;
    section.resize(SECTION_W, 200);

    // ORIGINAL label
    const origLabel = figma.createText();
    origLabel.fontName = { family: 'Inter', style: 'Bold' };
    origLabel.fontSize = 14;
    origLabel.characters = 'ORIGINAL';
    origLabel.fills = [{ type: 'SOLID', color: { r: 0.53, g: 0.53, b: 0.53 } }];
    origLabel.x = PAD;
    origLabel.y = PAD;
    section.appendChild(origLabel);

    const origText = figma.createText();
    origText.fontName = { family: 'Inter', style: 'Regular' };
    origText.fontSize = 16;
    origText.textAutoResize = 'HEIGHT';
    origText.resize(SCRIPT_COL_W, 100);
    origText.characters = originalScript || 'N/A';
    origText.fills = [{ type: 'SOLID', color: { r: 0.867, g: 0.867, b: 0.867 } }];
    origText.x = PAD;
    origText.y = PAD + origLabel.height + 8;
    section.appendChild(origText);

    // 한국어 label
    const koLabel = figma.createText();
    koLabel.fontName = { family: 'Inter', style: 'Bold' };
    koLabel.fontSize = 14;
    koLabel.characters = '한국어';
    koLabel.fills = [{ type: 'SOLID', color: { r: 0.53, g: 0.53, b: 0.53 } }];
    koLabel.x = PAD * 2 + SCRIPT_COL_W;
    koLabel.y = PAD;
    section.appendChild(koLabel);

    const koText = figma.createText();
    koText.fontName = koreanFont;
    koText.fontSize = 16;
    koText.textAutoResize = 'HEIGHT';
    koText.resize(SCRIPT_COL_W, 100);
    koText.characters = translatedScript || 'N/A';
    koText.fills = [{ type: 'SOLID', color: { r: 0.867, g: 0.867, b: 0.867 } }];
    koText.x = PAD * 2 + SCRIPT_COL_W;
    koText.y = PAD + koLabel.height + 8;
    section.appendChild(koText);

    const scriptsBottom = PAD + Math.max(
      origLabel.height + 8 + origText.height,
      koLabel.height + 8 + koText.height
    );

    // FRAMES label
    const framesLabel = figma.createText();
    framesLabel.fontName = { family: 'Inter', style: 'Bold' };
    framesLabel.fontSize = 14;
    framesLabel.characters = 'FRAMES';
    framesLabel.fills = [{ type: 'SOLID', color: { r: 0.53, g: 0.53, b: 0.53 } }];
    framesLabel.x = PAD;
    framesLabel.y = scriptsBottom + PAD;
    section.appendChild(framesLabel);

    const gridY = scriptsBottom + PAD + framesLabel.height + 12;

    const gridFrame = figma.createFrame();
    gridFrame.name = '_grid';
    gridFrame.fills = [];
    gridFrame.resize(1, 1);
    gridFrame.x = PAD;
    gridFrame.y = gridY;
    section.appendChild(gridFrame);

    section.resize(SECTION_W, gridY + 1 + PAD);
    section.x = figma.viewport.center.x - SECTION_W / 2;
    section.y = figma.viewport.center.y + sectionCount * (section.height + 100);
    sectionCount++;

    figma.currentPage.appendChild(section);
    figma.viewport.scrollAndZoomIntoView([section]);

    // Mark as processed so it won't be recreated next time
    await saveProcessed(projectId);

    const fileKey = figma.fileKey;
    const figmaUrl = fileKey
      ? `https://www.figma.com/file/${fileKey}?node-id=${encodeURIComponent(section.id)}`
      : null;

    figma.ui.postMessage({ type: 'section-created', projectId, sectionId: section.id, gridFrameId: gridFrame.id, figmaUrl });
  }

  else if (msg.type === 'add-frame-to-section') {
    const { frame, sectionId, gridFrameId } = msg;
    figma.ui.postMessage({ type: 'fetch-image-for-grid', url: frame.storage_url, frame, sectionId, gridFrameId });
  }

  else if (msg.type === 'image-fetched-for-grid') {
    const { bytes, frame, sectionId, gridFrameId } = msg;

    const gridFrame = figma.getNodeById(gridFrameId) as FrameNode;
    const section = figma.getNodeById(sectionId) as FrameNode;
    if (!gridFrame || !section) {
      figma.ui.postMessage({ type: 'frame-add-error', message: '섹션이 캔버스에서 삭제되었습니다.' });
      return;
    }

    const count = gridFrame.children.length;
    const col = count % GRID_COLS;
    const row = Math.floor(count / GRID_COLS);

    const imgNode = figma.createFrame();
    imgNode.name = `${frame.timestamp_seconds}s`;
    imgNode.resize(IMG_W, IMG_H);
    imgNode.cornerRadius = 8;
    imgNode.x = col * (IMG_W + IMG_GAP);
    imgNode.y = row * (IMG_H + IMG_GAP);

    const image = figma.createImage(new Uint8Array(bytes));
    imgNode.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
    gridFrame.appendChild(imgNode);

    const newCount = count + 1;
    const totalCols = Math.min(newCount, GRID_COLS);
    const totalRows = Math.ceil(newCount / GRID_COLS);
    gridFrame.resize(
      totalCols * IMG_W + (totalCols - 1) * IMG_GAP,
      totalRows * IMG_H + (totalRows - 1) * IMG_GAP
    );

    section.resize(SECTION_W, gridFrame.y + gridFrame.height + PAD);

    figma.ui.postMessage({ type: 'frame-added' });
  }
};
