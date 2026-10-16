# Changelog

## 1.0.3

### Added

- A keyboard shortcut to open a new local terminal, set in Settings, Keyboard Shortcuts
- Pasting a copied image with Ctrl+V or Cmd+V uploads it to the host, the same as the paste image button
- Connect to hosts behind a Cloudflare Tunnel, with an optional Access service token, from the host's Terminal tab
- Other plugins can open a terminal tab attached to a tmux session
- Keep tab open on exit, in a host's Terminal tab, keeps the output on screen when the shell exits or the connection closes; press Enter to reconnect

### Changed

- The local terminal uses your terminal look from host defaults (theme, font, cursor and spacing)
- On macOS, Option+drag selects text even while an app like Midnight Commander uses the mouse

### Fixed

- The mouse wheel over a tmux session walked shell history instead of scrolling; it now scrolls tmux's own history

## 1.0.2

### Fixed

- The mouse wheel walked shell history instead of doing nothing when there was nothing to scroll back
- Fast scroll with a modifier key no longer scrolls the page behind the terminal
- Password autofill now knows a macOS or BSD sudo `Password:` prompt is from sudo, so it follows the sudo autofill setting and fills the sudo password
- Passwords typed at a password prompt are no longer saved to command history

## 1.0.1

### Fixed

- Terminal links opened straight from a URL no longer crash with a command history error

## 1.0.0

### Added

- First release
- SSH terminals with tabs, split screen, jump hosts and host key checks
- Sessions stay alive after a disconnect and reconnect on their own, with tmux and Mosh support
- Themes, fonts, syntax highlighting and a toolbar with live stats
- Command history with autocomplete, macros and keystrokes sent to several terminals at once
- Shared sessions keep read-only viewers read-only, even after they leave
- A local terminal in the desktop app
