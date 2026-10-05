// Run with agent-browser-cli exec --tab <id> --file tests/composer-layout.browser.js.
// Open an unpublished composer first. Test at phone widths with a shortened
// viewport, and on desktop. This toggles preview ten times without submitting.
return await (async () => {
  const composer = document.querySelector('.Composer.visible:not(.minimized)');
  const button = composer?.querySelector('.item-preview button');
  if (!button) throw new Error('Open a composer with a preview button first');

  const textarea = composer.querySelector('.TextEditor-editor');
  const sample = 'Split View mobile layout regression';
  if (textarea?.tagName === 'TEXTAREA') {
    textarea.value = sample;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    m.redraw.sync();
  }

  const results = [];
  for (let i = 0; i < 10; i++) {
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
    const containerRect = container.getBoundingClientRect();
    const editorRect = editor?.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const footerRect = composer.querySelector('.Composer-footer').getBoundingClientRect();
    const active = container.classList.contains('is-split-view');
    const mobile = matchMedia('(max-width: 767px)').matches;
    const flexible = Array.from(composer.querySelectorAll('.Composer-flexible'));
    const previewVisible = getComputedStyle(preview).display !== 'none' && previewRect.height > 20;
    const editorVisible = Boolean(editor && editorRect.height > 20);
    const mobilePreview = active && mobile;
    const visualViewport = window.visualViewport;
    const expectedHeight = visualViewport?.height || innerHeight;
    const expectedTop = visualViewport?.offsetTop || 0;
    const expectedBottom = expectedTop + expectedHeight;

    results.push({
      active,
      editorHeight: editorRect?.height || 0,
      previewHeight: previewRect.height,
      toolbarVisible: footerRect.bottom <= Math.min(rootRect.bottom, expectedBottom) + 1,
      editorVisible,
      previewVisible,
      fullscreen: !mobile || (Math.abs(rootRect.height - expectedHeight) < 2 && Math.abs(rootRect.top - expectedTop) < 2),
      previewFits: !mobilePreview || (previewRect.top >= containerRect.top - 1 && previewRect.bottom <= footerRect.top + 1),
      exclusiveViews: !mobile || (mobilePreview ? !editorVisible && previewVisible : editorVisible && !previewVisible),
      singleAllocation: flexible.length === 1 && flexible[0] === (mobilePreview ? container : editor),
      draftPreserved: !textarea || textarea.tagName !== 'TEXTAREA' || textarea.value === sample,
    });
  }

  return {
    viewport: { width: innerWidth, height: innerHeight },
    results,
    passed: results.every((result) => {
      return result.toolbarVisible && result.fullscreen && result.previewFits && result.exclusiveViews && result.singleAllocation && result.draftPreserved;
    }),
  };
})().catch((error) => ({ passed: false, error: error.message }));
