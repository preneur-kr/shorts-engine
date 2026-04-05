figma.showUI(__html__, { width: 400, height: 600 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'inject-storyboard') {
    const { project, frames, analysis } = msg.payload;

    // Load standard font for text nodes
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });

    // 1. Create Main Auto-layout Frame for the Storyboard
    const storyboardFrame = figma.createFrame();
    storyboardFrame.name = `Storyboard: ${project.title || project.id}`;
    storyboardFrame.layoutMode = "VERTICAL";
    storyboardFrame.itemSpacing = 24;
    storyboardFrame.paddingTop = 32;
    storyboardFrame.paddingBottom = 32;
    storyboardFrame.paddingLeft = 32;
    storyboardFrame.paddingRight = 32;
    storyboardFrame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
    storyboardFrame.cornerRadius = 16;

    // 2. Add Title and Hook Analysis
    const titleNode = figma.createText();
    titleNode.characters = `📌 ${project.title || 'Untitled Project'}\n\n💡 Hook: ${analysis?.hook_analysis || 'No analysis'}`;
    titleNode.fontName = { family: "Inter", style: "Bold" };
    titleNode.fontSize = 20;
    titleNode.layoutAlign = "STRETCH";
    storyboardFrame.appendChild(titleNode);

    // 3. Render Frames
    const framesContainer = figma.createFrame();
    framesContainer.name = "Frames";
    framesContainer.layoutMode = "HORIZONTAL";
    framesContainer.itemSpacing = 16;
    framesContainer.fills = []; // transparent
    storyboardFrame.appendChild(framesContainer);

    for (const frame of frames.slice(0, 5)) { // Limit to 5 frames for prototype speed
      const imgFrame = figma.createFrame();
      imgFrame.resize(200, 350);
      
      // Request image bytes from UI (since figma plugin core cannot use fetch directly for binary sometimes)
      figma.ui.postMessage({ type: 'fetch-image', url: frame.storage_url, frameId: imgFrame.id });
      
      framesContainer.appendChild(imgFrame);
    }

    // Place it on canvas
    storyboardFrame.x = figma.viewport.center.x;
    storyboardFrame.y = figma.viewport.center.y;
    figma.currentPage.appendChild(storyboardFrame);
    figma.viewport.scrollAndZoomIntoView([storyboardFrame]);

  } else if (msg.type === 'image-fetched') {
    // Fill the frame with the fetched image bytes
    const targetNode = figma.getNodeById(msg.frameId) as FrameNode;
    if (targetNode) {
      const image = figma.createImage(new Uint8Array(msg.bytes));
      targetNode.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
    }
  }

  // Do not close UI immediately to allow images to load
};
