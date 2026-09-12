import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import ComposerState from 'flarum/forum/states/ComposerState';
import TextEditor from 'flarum/common/components/TextEditor';

const PREVIEW_MIN_HEIGHT = 120;
const PREVIEW_UPDATE_INTERVAL = 150;

function getEditorContainer(component) {
  return component.$('.TextEditor-editorContainer')[0];
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

  return preview;
}

function syncPreviewHeight(component) {
  const container = getEditorContainer(component);
  const preview = container && container.querySelector('.Split-view');
  const editor = container && container.querySelector('.TextEditor-editor');

  if (!preview || !editor) return;

  const height = Math.max(PREVIEW_MIN_HEIGHT, editor.getBoundingClientRect().height || editor.offsetHeight);

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
  const editor = container && container.querySelector('.TextEditor-editor');

  if (!editor || component.composerResizeObserver || component.composerResizeHandler) return;

  if (typeof ResizeObserver !== 'undefined') {
    component.composerResizeObserver = new ResizeObserver(() => syncPreviewHeight(component));
    component.composerResizeObserver.observe(editor);
  }

  component.composerResizeHandler = () => syncPreviewHeight(component);
  window.addEventListener('resize', component.composerResizeHandler);
}

function stopObservingEditor(component) {
  if (component.composerResizeObserver) {
    component.composerResizeObserver.disconnect();
    component.composerResizeObserver = null;
  }

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

function enableSplitViewOnComposer(path) {
  // Composer bodies are lazy-loaded in Flarum 2, and jumpToPreview is an
  // instance field, so patch each body's oninit after the core module loads.
  extend(path, 'oninit', function () {
    this.jumpToPreview = toggleSplitView;
  });
}

app.initializers.add('nodeloc-split-view', () => {
  extend(ComposerState.prototype, 'load', function () {
    this.isSplitView = false;
  });

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

  enableSplitViewOnComposer('flarum/forum/components/DiscussionComposer');
  enableSplitViewOnComposer('flarum/forum/components/ReplyComposer');
  enableSplitViewOnComposer('flarum/forum/components/EditPostComposer');
});
