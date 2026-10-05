import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import TextEditor from 'flarum/common/components/TextEditor';
import extractText from 'flarum/common/utils/extractText';

const PREVIEW_MIN_HEIGHT = 120;
const PREVIEW_UPDATE_INTERVAL = 150;
const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

function getEditorContainer(component) {
  return component.$('.TextEditor-editorContainer')[0];
}

function isVisibleEditor(editor) {
  if (!editor) return false;

  const style = window.getComputedStyle(editor);

  return style.display !== 'none' && style.visibility !== 'hidden' && editor.offsetParent !== null;
}

function getEditorWrappers(container) {
  if (!container) return [];

  return Array.from(container.children).filter((child) => child.classList.contains('ComposerBody-mentionsWrapper'));
}

function getVisibleEditorWrapper(container) {
  const wrappers = getEditorWrappers(container);

  return (
    wrappers.find((wrapper) => Array.from(wrapper.querySelectorAll('.TextEditor-editor')).some(isVisibleEditor)) ||
    wrappers.find((wrapper) => !wrapper.classList.contains('Split-view-editorWrapper--inactive')) ||
    wrappers[0] ||
    null
  );
}

function getVisibleEditor(container) {
  if (!container) return null;

  const editors = Array.from(container.querySelectorAll('.TextEditor-editor'));
  const activeWrapper = getVisibleEditorWrapper(container);

  return (
    editors.find(isVisibleEditor) ||
    editors.find((editor) => activeWrapper?.contains(editor)) ||
    editors.find((editor) => editor.classList.contains('Composer-flexible')) ||
    editors[0] ||
    null
  );
}

function syncEditorWrapperLayout(container, preview) {
  const wrappers = getEditorWrappers(container);

  if (!wrappers.length) return;

  const visibleWrapper = getVisibleEditorWrapper(container);

  wrappers.forEach((wrapper) => {
    wrapper.classList.toggle('Split-view-editorWrapper--inactive', wrapper !== visibleWrapper);
  });

  if (!preview || !visibleWrapper) return;

  // Pay-to-see can create two mention wrappers: one for the visual editor and
  // one for the serialized textarea. Keep only the active wrapper in the
  // layout, with the preview immediately after it.
  if (visibleWrapper.nextElementSibling !== preview) {
    visibleWrapper.after(preview);
  }
}

function ensurePreviewElement(component) {
  const container = getEditorContainer(component);

  if (!container) return null;

  let preview = container.querySelector('.Split-view');

  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'Split-view Post-body hidden';
    preview.setAttribute('role', 'region');
    preview.setAttribute('aria-label', 'Preview');
    container.append(preview);
  }

  syncEditorWrapperLayout(container, preview);

  return preview;
}

function syncPreviewHeight(component) {
  const container = getEditorContainer(component);
  const preview = container && container.querySelector('.Split-view');
  const editor = getVisibleEditor(container);

  if (!preview || !editor) return;

  syncEditorWrapperLayout(container, preview);

  const isMobile = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  const isMobileSplit = isMobile && container.classList.contains('is-split-view');
  container.classList.toggle('is-mobile-preview', isMobileSplit);

  // Give the active mobile view the height allocated by Flarum; the hidden
  // editor must not keep its own flexible allocation while previewing.
  let layoutChanged = container.classList.contains('Composer-flexible') !== isMobileSplit;
  container.classList.toggle('Composer-flexible', isMobileSplit);
  container.querySelectorAll('.TextEditor-editor').forEach((candidate) => {
    const flexible = !isMobileSplit && candidate === editor;
    layoutChanged ||= candidate.classList.contains('Composer-flexible') !== flexible;
    candidate.classList.toggle('Composer-flexible', flexible);
  });

  if (layoutChanged) m.redraw();

  if (isMobileSplit) {
    if (editor.style.height) editor.style.height = '';
    if (preview.style.height) preview.style.height = '';
    if (preview.style.maxHeight) preview.style.maxHeight = '';
    return;
  }

  if (container.style.height) container.style.height = '';
  const height = Math.max(PREVIEW_MIN_HEIGHT, editor.getBoundingClientRect().height || editor.offsetHeight);

  const heightValue = `${height}px`;

  if (preview.style.height !== heightValue) {
    preview.style.height = heightValue;
  }

  if (preview.style.maxHeight !== heightValue) {
    preview.style.maxHeight = heightValue;
  }
}

function renderPreview(component) {
  const preview = ensurePreviewElement(component);

  if (!preview) return false;

  const content = component.attrs.composer.fields.content() || '';
  s9e.TextFormatter.preview(content, preview);
  preview.classList.toggle('Split-view--empty', !content.trim());
  preview.setAttribute('data-empty-label', extractText(app.translator.trans('nodeloc-split-view.forum.empty_preview')));
  syncPreviewHeight(component);

  return true;
}

function startPreview(component) {
  if (component.composerPreviewInterval) return;
  if (!renderPreview(component)) return;

  let previousContent = component.attrs.composer.fields.content() || '';

  component.composerPreviewInterval = setInterval(() => {
    const currentContent = component.attrs.composer.fields.content() || '';

    if (currentContent !== previousContent) {
      previousContent = currentContent;
      renderPreview(component);
    }
  }, PREVIEW_UPDATE_INTERVAL);
}

function stopPreview(component) {
  if (component.composerPreviewInterval) {
    clearInterval(component.composerPreviewInterval);
    component.composerPreviewInterval = null;
  }
}

function observeEditor(component) {
  const container = getEditorContainer(component);
  const editor = getVisibleEditor(container);

  if (!editor) return;

  if (component.composerObservedEditor === editor && (component.composerResizeObserver || component.composerResizeHandler)) return;

  if (component.composerResizeObserver) {
    component.composerResizeObserver.disconnect();
    component.composerResizeObserver = null;
  }

  component.composerObservedEditor = editor;

  if (typeof ResizeObserver !== 'undefined') {
    component.composerResizeObserver = new ResizeObserver(() => syncPreviewHeight(component));
    component.composerResizeObserver.observe(editor);
  }

  if (!component.composerResizeHandler) {
    component.composerResizeHandler = () => syncPreviewHeight(component);
    window.addEventListener('resize', component.composerResizeHandler);
  }
}

function stopObservingEditor(component) {
  if (component.composerResizeObserver) {
    component.composerResizeObserver.disconnect();
    component.composerResizeObserver = null;
  }

  component.composerObservedEditor = null;

  if (component.composerResizeHandler) {
    window.removeEventListener('resize', component.composerResizeHandler);
    component.composerResizeHandler = null;
  }
}

function syncMobileComposer(component) {
  const container = getEditorContainer(component);
  const composer = container?.closest('.Composer');

  if (!container || !composer) return;

  const isMobile = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  const viewport = window.visualViewport;
  const height = viewport?.height || window.innerHeight;
  const top = viewport?.offsetTop || 0;

  composer.classList.toggle('SplitView-mobileComposer', isMobile);
  composer.style.setProperty('--split-view-viewport-height', `${height}px`);
  composer.style.setProperty('--split-view-viewport-top', `${top}px`);
  composer.style.setProperty('--split-view-viewport-document-top', `${window.scrollY + top}px`);
}

function observeMobileComposer(component) {
  if (component.mobileComposerViewportHandler) return;

  const handler = () => {
    syncMobileComposer(component);
    syncPreviewHeight(component);
  };
  const viewport = window.visualViewport;

  window.addEventListener('resize', handler);
  viewport?.addEventListener('resize', handler);
  viewport?.addEventListener('scroll', handler);

  component.mobileComposerViewportHandler = handler;
  component.mobileComposerViewport = viewport;
}

function stopObservingMobileComposer(component) {
  const handler = component.mobileComposerViewportHandler;

  if (!handler) return;

  window.removeEventListener('resize', handler);
  component.mobileComposerViewport?.removeEventListener('resize', handler);
  component.mobileComposerViewport?.removeEventListener('scroll', handler);
  component.mobileComposerViewportHandler = null;
  component.mobileComposerViewport = null;

  const composer = getEditorContainer(component)?.closest('.Composer');
  composer?.classList.remove('SplitView-mobileComposer');
  composer?.style.removeProperty('--split-view-viewport-height');
  composer?.style.removeProperty('--split-view-viewport-top');
  composer?.style.removeProperty('--split-view-viewport-document-top');
}

function observeEditorWrappers(component) {
  const container = getEditorContainer(component);

  if (!container) return;
  if (component.composerWrapperObserver?.container === container) return;

  stopObservingEditorWrappers(component);

  const observer = new MutationObserver(() => {
    const preview = container.querySelector('.Split-view');

    syncEditorWrapperLayout(container, preview);

    if (component.attrs.composer?.isSplitView) {
      syncPreviewHeight(component);
    }
  });

  observer.observe(container, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });

  component.composerWrapperObserver = { container, observer };
}

function stopObservingEditorWrappers(component) {
  component.composerWrapperObserver?.observer.disconnect();
  component.composerWrapperObserver = null;
}

function syncSplitView(component) {
  const container = getEditorContainer(component);
  const preview = ensurePreviewElement(component);
  const composer = component.attrs.composer;
  const isActive = !!(composer && composer.isSplitView);

  if (!container || !preview) return;

  container.classList.toggle('is-split-view', isActive);
  preview.classList.toggle('hidden', !isActive);
  container.closest('.Composer')?.querySelector('.item-preview button')?.setAttribute('aria-pressed', isActive ? 'true' : 'false');

  if (isActive) {
    observeEditor(component);
    syncPreviewHeight(component);
    startPreview(component);
  } else {
    stopPreview(component);
    stopObservingEditor(component);
    syncPreviewHeight(component);
  }
}

function toggleSplitView(event) {
  event?.preventDefault();

  const isMobile = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  const container = this.$('.TextEditor-editorContainer')[0];
  const editor = isMobile && !this.composer.isSplitView ? getVisibleEditor(container) : null;

  if (editor) {
    this.splitViewSelection = {
      start: typeof editor.selectionStart === 'number' ? editor.selectionStart : null,
      end: typeof editor.selectionEnd === 'number' ? editor.selectionEnd : null,
      direction: editor.selectionDirection,
    };
    editor.blur();
  }

  this.composer.isSplitView = !this.composer.isSplitView;
  // The preview button can be clicked while another composer extension has
  // a pending redraw. Flush this state change immediately so the editor and
  // preview never get out of sync.
  m.redraw.sync();

  if (isMobile && !this.composer.isSplitView) {
    const selection = this.splitViewSelection;

    requestAnimationFrame(() => {
      const activeEditor = getVisibleEditor(this.$('.TextEditor-editorContainer')[0]);

      if (!activeEditor) return;

      activeEditor.focus();

      if (selection?.start !== null && selection?.start !== undefined && typeof activeEditor.setSelectionRange === 'function') {
        activeEditor.setSelectionRange(selection.start, selection.end, selection.direction);
      }
    });
  }
}

function enableSplitViewOnComposers() {
  // Composer bodies are lazy-loaded in Flarum 2. Patch the concrete composer
  // classes so their instance-level preview callback is always available.
  ['DiscussionComposer', 'ReplyComposer', 'EditPostComposer'].forEach((name) => {
    extend(`flarum/forum/components/${name}`, 'oninit', function () {
      this.jumpToPreview = toggleSplitView;
    });
  });
}

app.initializers.add('nodeloc-split-view', () => {
  extend(TextEditor.prototype, 'oncreate', function () {
    if (!this.attrs.composer) return;

    syncSplitView(this);
    observeEditorWrappers(this);
    syncMobileComposer(this);
    observeMobileComposer(this);
  });

  extend(TextEditor.prototype, 'onupdate', function () {
    if (!this.attrs.composer) return;

    syncSplitView(this);
    observeEditorWrappers(this);
    syncMobileComposer(this);
    observeMobileComposer(this);
  });

  extend(TextEditor.prototype, 'onremove', function () {
    stopPreview(this);
    stopObservingEditor(this);
    stopObservingEditorWrappers(this);
    stopObservingMobileComposer(this);
  });

  enableSplitViewOnComposers();
});
