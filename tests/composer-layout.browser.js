// Run with agent-browser-cli exec --tab <id> --file tests/composer-layout.browser.js.
// Open an unpublished composer first. Test at phone widths with a shortened
// viewport, and on desktop. This toggles preview eight times without submitting.
return await (async () => {
  const composer = document.querySelector('.Composer.visible:not(.minimized)');
  const button = composer?.querySelector('.item-preview button');
  if (!button) throw new Error('Open a composer with a preview button first');

  const results = [];
  for (let i = 0; i < 8; i++) {
    button.click();
    await scheduler.postTask(() => {});
    m.redraw.sync();
    await scheduler.postTask(() => {});

    const container = composer.querySelector('.TextEditor-editorContainer');
    const editor = Array.from(container.querySelectorAll('.TextEditor-editor')).find((element) => {
      return getComputedStyle(element).display !== 'none' && element.offsetParent !== null;
    });
    const preview = container.querySelector('.Split-view');
    const rootRect = composer.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const footerRect = composer.querySelector('.Composer-footer').getBoundingClientRect();
    const active = container.classList.contains('is-split-view');
    const mobile = matchMedia('(max-width: 767px)').matches;
    const flexible = Array.from(composer.querySelectorAll('.Composer-flexible'));

    results.push({
      active,
      editorHeight: editorRect.height,
      previewHeight: previewRect.height,
      toolbarVisible: footerRect.bottom <= Math.min(rootRect.bottom, innerHeight) + 1,
      editorVisible: editorRect.height > 20,
      previewFits: !active || !mobile || (editorRect.bottom <= previewRect.top + 1 && previewRect.bottom <= footerRect.top + 1),
      singleAllocation: flexible.length === 1 && flexible[0] === (active && mobile ? container : editor),
    });
  }

  return {
    viewport: { width: innerWidth, height: innerHeight },
    results,
    passed: results.every((result) => result.toolbarVisible && result.editorVisible && result.previewFits && result.singleAllocation),
  };
})().catch((error) => ({ passed: false, error: error.message }));
