figma.showUI(__html__, { width: 400, height: 600 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'inject-storyboard') {
    const { project, frames, analysis } = msg.payload;

    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });

    // 1. Main storyboard frame
    const storyboardFrame = figma.createFrame();
    storyboardFrame.name = `Storyboard: ${project.source_url}`;
    storyboardFrame.layoutMode = "VERTICAL";
    storyboardFrame.itemSpacing = 32;
    storyboardFrame.paddingTop = 40;
    storyboardFrame.paddingBottom = 40;
    storyboardFrame.paddingLeft = 40;
    storyboardFrame.paddingRight = 40;
    storyboardFrame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];
    storyboardFrame.cornerRadius = 16;
    storyboardFrame.primaryAxisSizingMode = "AUTO";
    storyboardFrame.counterAxisSizingMode = "FIXED";
    storyboardFrame.resize(1200, 100);

    // 2. Hook Analysis
    const hookNode = figma.createText();
    hookNode.characters = `💡 Hook Analysis\n${analysis?.hook_analysis || 'No analysis'}`;
    hookNode.fontName = { family: "Inter", style: "Bold" };
    hookNode.fontSize = 18;
    hookNode.layoutAlign = "STRETCH";
    storyboardFrame.appendChild(hookNode);

    // 3. Frames (all frames)
    const framesContainer = figma.createFrame();
    framesContainer.name = "Frames";
    framesContainer.layoutMode = "HORIZONTAL";
    framesContainer.itemSpacing = 12;
    framesContainer.fills = [];
    framesContainer.primaryAxisSizingMode = "AUTO";
    framesContainer.counterAxisSizingMode = "AUTO";
    storyboardFrame.appendChild(framesContainer);

    for (const frame of frames) {
      const imgFrame = figma.createFrame();
      imgFrame.resize(160, 284);
      imgFrame.cornerRadius = 8;
      figma.ui.postMessage({ type: 'fetch-image', url: frame.storage_url, frameId: imgFrame.id });
      framesContainer.appendChild(imgFrame);

      // Timestamp label
      const label = figma.createText();
      label.characters = `${frame.timestamp_seconds}s`;
      label.fontSize = 11;
      label.fontName = { family: "Inter", style: "Regular" };
      label.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
      framesContainer.appendChild(label);
    }

    // 4. Scripts section
    const scriptsFrame = figma.createFrame();
    scriptsFrame.name = "Scripts";
    scriptsFrame.layoutMode = "HORIZONTAL";
    scriptsFrame.itemSpacing = 24;
    scriptsFrame.fills = [];
    scriptsFrame.primaryAxisSizingMode = "AUTO";
    scriptsFrame.counterAxisSizingMode = "AUTO";
    storyboardFrame.appendChild(scriptsFrame);

    // Original script
    const originalBlock = figma.createFrame();
    originalBlock.layoutMode = "VERTICAL";
    originalBlock.itemSpacing = 8;
    originalBlock.paddingTop = 16;
    originalBlock.paddingBottom = 16;
    originalBlock.paddingLeft = 16;
    originalBlock.paddingRight = 16;
    originalBlock.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    originalBlock.cornerRadius = 8;
    originalBlock.primaryAxisSizingMode = "AUTO";
    originalBlock.resize(540, 100);

    const originalTitle = figma.createText();
    originalTitle.characters = "📝 Original Script";
    originalTitle.fontName = { family: "Inter", style: "Bold" };
    originalTitle.fontSize = 14;
    originalBlock.appendChild(originalTitle);

    const originalText = figma.createText();
    originalText.characters = analysis?.original_script || 'N/A';
    originalText.fontName = { family: "Inter", style: "Regular" };
    originalText.fontSize = 13;
    originalText.layoutAlign = "STRETCH";
    originalBlock.appendChild(originalText);
    scriptsFrame.appendChild(originalBlock);

    // Korean script
    const koreanBlock = figma.createFrame();
    koreanBlock.layoutMode = "VERTICAL";
    koreanBlock.itemSpacing = 8;
    koreanBlock.paddingTop = 16;
    koreanBlock.paddingBottom = 16;
    koreanBlock.paddingLeft = 16;
    koreanBlock.paddingRight = 16;
    koreanBlock.fills = [{ type: 'SOLID', color: { r: 0.94, g: 0.97, b: 1 } }];
    koreanBlock.cornerRadius = 8;
    koreanBlock.primaryAxisSizingMode = "AUTO";
    koreanBlock.resize(540, 100);

    const koreanTitle = figma.createText();
    koreanTitle.characters = "🇰🇷 Korean Script";
    koreanTitle.fontName = { family: "Inter", style: "Bold" };
    koreanTitle.fontSize = 14;
    koreanBlock.appendChild(koreanTitle);

    const koreanText = figma.createText();
    koreanText.characters = analysis?.translated_script || 'N/A';
    koreanText.fontName = { family: "Inter", style: "Regular" };
    koreanText.fontSize = 13;
    koreanText.layoutAlign = "STRETCH";
    koreanBlock.appendChild(koreanText);
    scriptsFrame.appendChild(koreanBlock);

    // 5. Strategic Note
    const stratNode = figma.createText();
    stratNode.characters = `🎯 Strategic Note\n${analysis?.strategic_note || 'N/A'}`;
    stratNode.fontName = { family: "Inter", style: "Regular" };
    stratNode.fontSize = 14;
    stratNode.layoutAlign = "STRETCH";
    storyboardFrame.appendChild(stratNode);

    // 6. Visual Cues
    const cues = analysis?.visual_cues;
    if (cues && Array.isArray(cues) && cues.length > 0) {
      const cuesNode = figma.createText();
      cuesNode.characters = `👁 Visual Cues\n${cues.map((c: string) => `• ${c}`).join('\n')}`;
      cuesNode.fontName = { family: "Inter", style: "Regular" };
      cuesNode.fontSize = 13;
      cuesNode.layoutAlign = "STRETCH";
      storyboardFrame.appendChild(cuesNode);
    }

    // Place on canvas
    storyboardFrame.x = figma.viewport.center.x - 600;
    storyboardFrame.y = figma.viewport.center.y - 300;
    figma.currentPage.appendChild(storyboardFrame);
    figma.viewport.scrollAndZoomIntoView([storyboardFrame]);

    // Send Figma deep link back to UI for Discord notification
    const fileKey = figma.fileKey;
    const nodeId = storyboardFrame.id;
    const figmaUrl = fileKey
      ? `https://www.figma.com/file/${fileKey}?node-id=${encodeURIComponent(nodeId)}`
      : null;

    figma.ui.postMessage({ type: 'storyboard-injected', projectId: project.id, figmaUrl });

  } else if (msg.type === 'image-fetched') {
    const targetNode = figma.getNodeById(msg.frameId) as FrameNode;
    if (targetNode) {
      const image = figma.createImage(new Uint8Array(msg.bytes));
      targetNode.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
    }
  }
};
