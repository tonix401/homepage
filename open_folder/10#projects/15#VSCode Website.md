## <a href="https://github.com/tonix401/vscode_website" target="_blank" rel="noopener noreferrer">VSCode Website</a>

![React](badges/react.svg)
![TypeScript](badges/typescript.svg)
![Vite](badges/vite.svg)
![Claude](badges/claude.svg)
![Git](badges/git.svg)

<video width="100%" controls loop muted poster="vscode_website/thumbnail.png">
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
 
A custom Vite plugin reads everything in `open_folder/` at build time and bundles it into a virtual module. No runtime file I/O, no server. The output is a fully static site. See the <a href="https://tonix401.github.io/vscode_website/" target="_blank" rel="noopener noreferrer">documentation</a> for a full breakdown.

---

<a href="https://github.com/tonix401/vscode_website" target="_blank" rel="noopener noreferrer" class="learnmore">Check it out on GitHub</a>

---

### THIS WEBSITE

The website you are currently on is also one of my projects, based on the vscode_website and extended to work like my hyprland desktop environment. Try clicking around and exploring a bit. Start by getting this vs code simulation out of fullscreen by clicking the `button at the top right`.

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
  .learnmore:hover{
    background: #434343;
  }
  .md-image {
    max-width: 680px
  }
</style>