## [VSCode Website](https://github.com/tonix401/vscode_website)

![React](https://img.shields.io/badge/React-555?logo=react&logoColor=%2361DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)
![Vite](https://img.shields.io/badge/Vite-8d25f9?logo=Vite&logoColor=white)
![Claude](https://img.shields.io/badge/Claude-D97757?logo=claude&logoColor=white)
![Git](https://img.shields.io/badge/Git-F05032?logo=git&logoColor=fff)

<video width="100%" controls loop muted poster="vscode_website/thumbnail.png" key="vscode_website">
  <source src="vscode_website/demo.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

---

Checkout the repo, drop files into `open_folder/`, run the dev server, and you get a read-only VSCode-style interface: 

- file explorer, 
- tab bar,
- line numbers, 
- syntax highlighting via Shiki, 
- fun customizable "activities"

the whole thing.
 
#### Preview for html and md files
 
The idea is to embed it in a portfolio or project page so visitors can browse source files without leaving the browser.
 
A custom Vite plugin reads everything in `open_folder/` at build time and bundles it into a virtual module. No runtime file I/O, no server. The output is a fully static site. See the [documentation](https://tonix401.github.io/vscode_website/) for a full breakdown.

---

<a href="https://github.com/tonix401/vscode_website" target="_blank" class="learnmore">Check it out on GitHub</a>

<style>
  .learnmore {
    display:inline-block;
    padding:0.4rem 1.6rem 0.4rem 1.2rem;
    background:#343434;
    color:#fff;
    border-radius:4px 1em 1em 4px / 4px 50% 50% 4px;
    corner-shape:round bevel bevel round;
    text-decoration:none;
    font-weight:600;
  }
  .md-image {
    max-width: 680px
  }
</style>