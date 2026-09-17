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

function ensurePreviewElement(component) {
  const container = getEditorContainer(component);

  if (!container) return null;

  let preview = container.querySelector('.Split-view');
  const editorWrapper = container.querySelector('.ComposerBody-mentionsWrapper');

  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'Split-view Post-body hidden';
    preview.setAttribute('role', 'region');
    preview.setAttribute('aria-label', 'Preview');
    container.append(preview);
  }

  // Flarum can render the preview before the editor wrapper. Keep the
  // Markdown editor on the left and the preview on the right.
  if (editorWrapper && editorWrapper.nextElementSibling !== preview) {
    editorWrapper.after(preview);
  }

  return preview;
}

function syncPreviewHeight(component) {
  const container = getEditorContainer(component);
  const preview = container && container.querySelector('.Split-view');
  const editor = container && container.querySelector('.TextEditor-editor');

  if (!preview || !editor) return;

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
