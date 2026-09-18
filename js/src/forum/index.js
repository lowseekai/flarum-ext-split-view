import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import TextEditor from 'flarum/common/components/TextEditor';

const PREVIEW_MIN_HEIGHT = 120;
const MOBILE_PREVIEW_MIN_HEIGHT = 180;
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
    wrappers[0] ||
    null
  );
}

function getVisibleEditor(container) {
  if (!container) return null;

  const editors = Array.from(container.querySelectorAll('.TextEditor-editor'));

  return editors.find(isVisibleEditor) || editors.find((editor) => editor.classList.contains('Composer-flexible')) || editors[0] || null;
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

  const minHeight = window.matchMedia(MOBILE_MEDIA_QUERY).matches ? MOBILE_PREVIEW_MIN_HEIGHT : PREVIEW_MIN_HEIGHT;
  const height = Math.max(minHeight, editor.getBoundingClientRect().height || editor.offsetHeight);

  preview.style.height = `${height}px`;
  preview.style.maxHeight = `${height}px`;
}

function renderPreview(component) {
  const preview = ensurePreviewElement(component);

  if (!preview) return false;

  s9e.TextFormatter.preview(component.attrs.composer.fields.content() || '', preview);
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

function syncSplitView(component) {
  const container = getEditorContainer(component);
  const preview = ensurePreviewElement(component);
  const composer = component.attrs.composer;
  const isActive = !!(composer && composer.isSplitView);

  if (!container || !preview) return;

  container.classList.toggle('is-split-view', isActive);
  preview.classList.toggle('hidden', !isActive);

  if (isActive) {
    observeEditor(component);
    syncPreviewHeight(component);
    startPreview(component);
  } else {
    stopPreview(component);
    stopObservingEditor(component);
  }
}

function toggleSplitView(event) {
  event?.preventDefault();

  this.composer.isSplitView = !this.composer.isSplitView;
  m.redraw();
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
    if (!this.attrs.preview || !this.attrs.composer) return;

    syncSplitView(this);
  });

  extend(TextEditor.prototype, 'onupdate', function () {
    if (!this.attrs.preview || !this.attrs.composer) return;

    syncSplitView(this);
  });

  extend(TextEditor.prototype, 'onremove', function () {
    stopPreview(this);
    stopObservingEditor(this);
  });

  enableSplitViewOnComposers();
});
