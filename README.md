# Split View

A Flarum extension that adds a live Markdown preview beside the composer.

This branch targets Flarum `2.0.x`. The package name remains
`nodeloc/flarum-ext-split-view` so it can replace the existing extension
without changing the Flarum extension ID.

## Installation

Add this repository as a Composer VCS repository, then require the Flarum 2
branch:

```json
{
  "repositories": [
    {
      "type": "vcs",
      "url": "https://github.com/lowseekai/flarum-ext-split-view"
    }
  ]
}
```

```sh
composer require nodeloc/flarum-ext-split-view:dev-flarum-2.x
```

The preview button is provided by Flarum core. When enabled, this extension
renders the editor on the left and a live preview on the right on larger
screens, with a vertical layout on phones.

## Updating

```sh
composer update nodeloc/flarum-ext-split-view --with-dependencies
```
