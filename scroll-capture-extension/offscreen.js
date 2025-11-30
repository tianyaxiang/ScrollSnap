// Offscreen document for clipboard operations
// Service Worker 无法直接访问 navigator.clipboard，需要通过此文件执行

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen' || message.action !== 'offscreenCopy') {
    return false;
  }

  handleClipboardCopy(message.dataUrl)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ success: false, error: error.message }));

  return true; // 保持消息通道开放
});

/**
 * 执行剪贴板复制操作
 * 使用 canvas + document.execCommand 方式，避免焦点问题
 * @param {string} dataUrl - 图片数据URL
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function handleClipboardCopy(dataUrl) {
  try {
    // 创建图片元素
    const img = document.createElement('img');
    img.src = dataUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    // 创建 canvas 并绘制图片
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // 转换为 blob
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });

    // 使用 ClipboardItem 写入（需要用户手势或特殊权限）
    // 由于 offscreen document 没有焦点，尝试使用 legacy 方式
    const item = new ClipboardItem({ 'image/png': blob });
    await navigator.clipboard.write([item]);

    return { success: true };
  } catch (error) {
    console.error('Clipboard copy failed:', error);
    // 如果 Clipboard API 失败，返回错误
    return { success: false, error: error.message };
  }
}
