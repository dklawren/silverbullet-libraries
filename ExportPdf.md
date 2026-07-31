---
name: "Library/Dklawren/ExportPdf"
tags: meta/library
files:
  - ExportPdf.js
  - html2pdf.bundle.min.js
---

# Export Page to PDF

Exports the current Silverbullet page to a PDF file saved alongside the original page.

## Usage

Run the command **"Export: Page to PDF"** from the command palette. The generated PDF will be saved next to the source page, for example:

- `Projects/My Project.md` -> `Projects/My Project.pdf`
- `Journal/2025-07-24.md` -> `Journal/2025-07-24.pdf`

## Requirements

- A modern browser (Chrome, Edge, Firefox, Safari).
- `html2pdf.js` bundled locally in `Library/Dklawren/html2pdf.bundle.min.js`.

## Notes

- PDFs are rendered as image-based pages. They display correctly on e-readers and in print, but text is not selectable.
- The command expands templates, transclusions, and wikilinks before rendering.

```space-lua
-- Generic page-to-PDF export.
-- Generates the PDF in the browser and writes it to the space via Lua.
-- Some clients (browser tabs) auto-await JS promises and return a Lua table.
-- Others (Tauri) return a raw Promise, so we use Promise callbacks there.

local exportPdf = js.import('/.fs/Library/Dklawren/ExportPdf.js')

command.define {
  name = 'Export: Page to PDF',
  run = function()
    editor.save()

    local pageName = editor.getCurrentPage()
    local mdText = editor.getText()
    local htmlBody = markdown.markdownToHtml(mdText, { expand = true })

    local ok, result = pcall(function()
      return exportPdf.exportPage(pageName, htmlBody)
    end)

    if not ok then
      editor.flashNotification('PDF export failed: ' .. tostring(result), 'error')
      return
    end

    if type(result) == 'table' then
      local writeOk, writeErr = pcall(function()
        return space.writeDocument(result.pdfPath, result.bytes)
      end)

      if not writeOk then
        editor.flashNotification('PDF export failed: ' .. tostring(writeErr), 'error')
        return
      end

      editor.flashNotification('Saved PDF: ' .. result.pdfPath)
      return
    end

    if type(result) == 'userdata' and type(result['then']) == 'function' then
      local onSuccess = js.tojs(function(r)
        local writeOk, writeErr = pcall(function()
          return space.writeDocument(r.pdfPath, r.bytes)
        end)

        if not writeOk then
          editor.flashNotification('PDF export failed: ' .. tostring(writeErr), 'error')
          return
        end

        editor.flashNotification('Saved PDF: ' .. r.pdfPath)
      end)

      local onError = js.tojs(function(err)
        editor.flashNotification('PDF export failed: ' .. tostring(err), 'error')
      end)

      result['then'](onSuccess, onError)
      return
    end

    editor.flashNotification('PDF export failed: unexpected result type ' .. type(result), 'error')
  end
}
```
