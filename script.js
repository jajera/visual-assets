const state = { q: "", tags: new Set(), type: "", size: "", data: [] };

// Dark mode initialization
function initDarkMode() {
    const saved = localStorage.getItem("darkMode");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = saved !== null ? saved === "true" : systemPrefersDark;

    const html = document.documentElement;
    if (isDark) {
        html.classList.add("dark");
        html.classList.remove("light-mode");
    } else {
        html.classList.remove("dark");
        html.classList.add("light-mode");
    }
    updateDarkModeIcon(isDark);
}

function updateDarkModeIcon(isDark) {
    const icon = document.getElementById("darkModeToggle")?.querySelector(".dark-mode-icon");
    if (icon) {
        icon.textContent = isDark ? "☀️" : "🌙";
    }
}

function toggleDarkMode() {
    const html = document.documentElement;
    const isDark = html.classList.toggle("dark");
    if (isDark) {
        html.classList.remove("light-mode");
    } else {
        html.classList.add("light-mode");
    }
    localStorage.setItem("darkMode", isDark.toString());
    updateDarkModeIcon(isDark);
}

// Extract theme from asset name
function extractTheme(name) {
    if (!name) return "";
    // Extract first part before dash (e.g., "aws-ec2-icon" -> "aws")
    const parts = name.split("-");
    return parts[0] || "";
}

// URL parameter handling
function getParams() {
    const u = new URL(location.href);
    const q = u.searchParams.get("q") || "";
    const tags = (u.searchParams.get("tags") || "").split(",").filter(Boolean);
    const type = u.searchParams.get("type") || "";
    const size = u.searchParams.get("size") || "";
    return { q, tags, type, size };
}

function setParams() {
    const u = new URL(location.href);
    const tags = [...state.tags].join(",");
    if (state.q) u.searchParams.set("q", state.q);
    else u.searchParams.delete("q");
    if (tags) u.searchParams.set("tags", tags);
    else u.searchParams.delete("tags");
    if (state.type) u.searchParams.set("type", state.type);
    else u.searchParams.delete("type");
    if (state.size) u.searchParams.set("size", state.size);
    else u.searchParams.delete("size");
    history.replaceState(null, "", u);
}

// Tag rendering
function renderTags() {
    const all = new Set();
    state.data.forEach(i => {
        if (i.tags) {
            i.tags.forEach(t => all.add(t));
        }
    });
    const wrap = document.getElementById("tags");
    const activeWrap = document.getElementById("activeTags");
    wrap.innerHTML = "";
    activeWrap.innerHTML = "";

    // Show active tags separately
    if (state.tags.size > 0) {
        [...state.tags].sort().forEach(t => {
            const b = document.createElement("button");
            b.textContent = t;
            b.className = "chip chip_on chip-active";
            b.onclick = () => {
                state.tags.delete(t);
                setParams();
                render();
                renderTags();
            };
            activeWrap.appendChild(b);
        });
    }

    // Show all tags
    [...all].sort().forEach(t => {
        const b = document.createElement("button");
        b.textContent = t;
        b.className = state.tags.has(t) ? "chip chip_on" : "chip";
        b.onclick = () => {
            if (state.tags.has(t)) state.tags.delete(t);
            else state.tags.add(t);
            setParams();
            render();
            renderTags();
        };
        wrap.appendChild(b);
    });
}

// Filter matching
function matches(asset) {
    const q = state.q.toLowerCase();
    // Search in name, description, and tags
    const nameHit = asset.name && asset.name.toLowerCase().includes(q);
    const descHit = asset.description && asset.description.toLowerCase().includes(q);
    const tagHit = asset.tags && asset.tags.some(t => t.toLowerCase().includes(q));
    const tagsOk = state.tags.size === 0 || [...state.tags].every(t => asset.tags && asset.tags.includes(t));
    const typeOk = !state.type || asset.type === state.type;
    const sizeOk = !state.size || String(asset.size) === state.size;
    return (q ? (nameHit || descHit || tagHit) : true) && tagsOk && typeOk && sizeOk;
}

// Check if asset is SVG
function isSvg(path) {
    return path && path.toLowerCase().endsWith('.svg');
}

// SVG to PNG conversion
async function svgToPng(svgPath, width = null, height = null) {
    try {
        const svgText = await fetch(svgPath).then(r => r.text());
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
        const svgElement = svgDoc.documentElement;

        // Get viewBox or use provided dimensions
        const viewBox = svgElement.getAttribute("viewBox");
        if (viewBox) {
            const [, , vbWidth, vbHeight] = viewBox.split(" ").map(Number);
            width = width || vbWidth || 512;
            height = height || vbHeight || 512;
        } else {
            width = width || Number(svgElement.getAttribute("width")) || 512;
            height = height || Number(svgElement.getAttribute("height")) || 512;
        }

        // Use asset size if available
        const asset = state.data.find(a => a.path === svgPath);
        if (asset && asset.size) {
            width = asset.size;
            height = asset.size;
        }

        const img = new Image();
        const svgBlob = new Blob([svgText], { type: "image/svg+xml" });
        const url = URL.createObjectURL(svgBlob);

        return new Promise((resolve, reject) => {
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(resolve, "image/png");
                URL.revokeObjectURL(url);
            };
            img.onerror = reject;
            img.src = url;
        });
    } catch (error) {
        console.error("SVG to PNG conversion failed:", error);
        throw error;
    }
}

// Copy SVG
async function copySvg(asset, button) {
    try {
        const svg = await fetch(asset.path).then(r => r.text());
        await navigator.clipboard.writeText(svg);
        const old = button.innerHTML;
        button.innerHTML = "✓";
        button.title = "Copied!";
        setTimeout(() => {
            button.innerHTML = old;
            button.title = "Copy SVG";
        }, 1000);
    } catch (err) {
        console.error("Failed to copy SVG:", err);
        alert("Failed to copy SVG to clipboard");
    }
}

// Copy PNG
async function copyPng(asset, button) {
    try {
        const blob = await svgToPng(asset.path);
        await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob })
        ]);
        const old = button.innerHTML;
        button.innerHTML = "✓";
        button.title = "Copied!";
        setTimeout(() => {
            button.innerHTML = old;
            button.title = "Copy PNG";
        }, 1000);
    } catch (err) {
        console.error("Failed to copy PNG:", err);
        alert("Failed to copy PNG to clipboard");
    }
}

// Download SVG
async function downloadSvg(asset) {
    try {
        const svg = await fetch(asset.path).then(r => r.text());
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = asset.path.split("/").pop();
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Failed to download SVG:", err);
        alert("Failed to download SVG");
    }
}

// Download PNG
async function downloadPng(asset) {
    try {
        const blob = await svgToPng(asset.path);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const filename = asset.path.split("/").pop().replace(".svg", ".png");
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Failed to download PNG:", err);
        alert("Failed to download PNG");
    }
}

// Render assets
function render() {
    const grid = document.getElementById("grid");
    grid.innerHTML = "";
    const frag = document.createDocumentFragment();

    const filteredAssets = state.data.filter(matches);
    const count = filteredAssets.length;
    const total = state.data.length;

    // Update asset count display
    const countElement = document.getElementById("assetCount");
    if (countElement) {
        if (count === total) {
            countElement.textContent = `${total} assets`;
        } else {
            countElement.textContent = `${count} of ${total} assets`;
        }
    }

    filteredAssets.forEach(asset => {
        const card = document.createElement("div");
        card.className = "card";

        const displayName = asset.name || 'Unknown';
        const description = asset.description || `${displayName} ${asset.type || 'asset'}`;
        const theme = extractTheme(asset.name);
        const sizeLabel = asset.size ? `${asset.size}×${asset.size}` : '';
        const isSvgAsset = isSvg(asset.path);

        // Action buttons (only for SVG)
        const actionButtons = isSvgAsset ? `
            <div class="card-actions">
                <button class="action-btn copy-svg" aria-label="Copy SVG" title="Copy SVG">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                    </svg>
                </button>
                <button class="action-btn copy-png" aria-label="Copy PNG" title="Copy PNG">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75 3.54-1.96-2.36L6.5 17h11l-3.54-4.71z"/>
                    </svg>
                </button>
                <button class="action-btn download-svg" aria-label="Download SVG" title="Download SVG">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                        </svg>
                </button>
                <button class="action-btn download-png" aria-label="Download PNG" title="Download PNG">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                    </svg>
                </button>
            </div>
        ` : '';

        card.innerHTML = `
            <div class="asset-container">
                <img src="${asset.path}" alt="${displayName}" class="asset-image" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'padding: 20px; text-align: center; color: var(--text-secondary);\\'>Image not found</div>'">
                ${actionButtons}
            </div>
            <div class="asset-tooltip">
                <div class="tooltip-title">${displayName}</div>
                <div class="tooltip-description">${description}</div>
            </div>
            <div class="card-content">
                <div class="name">${displayName}${sizeLabel ? ` (${sizeLabel})` : ''}</div>
                <div class="type-badge">${asset.type || 'asset'}</div>
            </div>
        `;

        // Attach event listeners for SVG actions
        if (isSvgAsset) {
            const copySvgBtn = card.querySelector(".copy-svg");
            const copyPngBtn = card.querySelector(".copy-png");
            const downloadSvgBtn = card.querySelector(".download-svg");
            const downloadPngBtn = card.querySelector(".download-png");

            if (copySvgBtn) {
                copySvgBtn.addEventListener("click", () => copySvg(asset, copySvgBtn));
            }
            if (copyPngBtn) {
                copyPngBtn.addEventListener("click", () => copyPng(asset, copyPngBtn));
            }
            if (downloadSvgBtn) {
                downloadSvgBtn.addEventListener("click", () => downloadSvg(asset));
            }
            if (downloadPngBtn) {
                downloadPngBtn.addEventListener("click", () => downloadPng(asset));
            }
        }

        frag.appendChild(card);
    });

    grid.appendChild(frag);
}

// Toggle tags visibility
function toggleTags() {
    const tags = document.getElementById("tags");
    const icon = document.getElementById("tagsToggleIcon");
    const isCollapsed = tags.classList.contains("tags-collapsed");

    if (isCollapsed) {
        tags.classList.remove("tags-collapsed");
        icon.textContent = "▲";
        document.getElementById("tagsToggleText").textContent = "Hide Tags";
    } else {
        tags.classList.add("tags-collapsed");
        icon.textContent = "▼";
        document.getElementById("tagsToggleText").textContent = "Show Tags";
    }
}

// Populate size filter dropdown
function populateSizeFilter() {
    const sizeFilter = document.getElementById("sizeFilter");
    if (!sizeFilter) return;

    // Get all unique sizes from assets
    const sizes = new Set();
    state.data.forEach(asset => {
        if (asset.size) {
            sizes.add(String(asset.size));
        }
    });

    // Clear existing options (except "All Sizes")
    while (sizeFilter.children.length > 1) {
        sizeFilter.removeChild(sizeFilter.lastChild);
    }

    // Add size options sorted numerically
    [...sizes].sort((a, b) => Number(a) - Number(b)).forEach(size => {
        const option = document.createElement("option");
        option.value = size;
        option.textContent = `${size}×${size}`;
        sizeFilter.appendChild(option);
    });
}

// Toggle README visibility
function toggleReadme() {
    const readme = document.getElementById("readmeContent");
    const icon = document.getElementById("readmeToggleIcon");
    const isCollapsed = readme.classList.contains("readme-collapsed");

    if (isCollapsed) {
        readme.classList.remove("readme-collapsed");
        icon.textContent = "▲";
        document.getElementById("readmeToggleText").textContent = "Hide README";
    } else {
        readme.classList.add("readme-collapsed");
        icon.textContent = "▼";
        document.getElementById("readmeToggleText").textContent = "Show README";
    }
}

// Back to top button
function initBackToTop() {
    const button = document.getElementById("backToTop");
    if (!button) return;

    function toggleVisibility() {
        if (window.pageYOffset > 300) {
            button.classList.add("visible");
        } else {
            button.classList.remove("visible");
        }
    }

    window.addEventListener("scroll", toggleVisibility);
    button.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
}

// Simple markdown to HTML converter (basic support)
function markdownToHtml(markdown) {
    if (!markdown) return '';

    let html = markdown;

    // Code blocks first (to avoid processing content inside)
    const codeBlocks = [];
    html = html.replace(/```([\s\S]*?)```/gim, (match, code) => {
        const id = `CODE_BLOCK_${codeBlocks.length}`;
        codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
        return id;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');

    // Headers (must be at start of line)
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');

    // Italic (but not if it's part of bold)
    html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/gim, '<em>$1</em>');

    // Restore code blocks
    codeBlocks.forEach((block, i) => {
        html = html.replace(`CODE_BLOCK_${i}`, block);
    });

    // Split into lines and process paragraphs
    const lines = html.split('\n');
    const processed = [];
    let currentPara = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) {
            if (currentPara.length > 0) {
                processed.push('<p>' + currentPara.join(' ') + '</p>');
                currentPara = [];
            }
            return;
        }

        // If it's already a tag (header, pre, etc.), add it directly
        if (trimmed.match(/^<(h[1-6]|pre|code|ul|ol|li)/)) {
            if (currentPara.length > 0) {
                processed.push('<p>' + currentPara.join(' ') + '</p>');
                currentPara = [];
            }
            processed.push(trimmed);
        } else {
            currentPara.push(trimmed);
        }
    });

    if (currentPara.length > 0) {
        processed.push('<p>' + currentPara.join(' ') + '</p>');
    }

    return processed.join('\n');
}

// Load README content
async function loadReadme() {
    try {
        const response = await fetch("README.md");
        if (!response.ok) {
            console.warn("README.md not found");
            return;
        }
        const markdown = await response.text();
        const html = markdownToHtml(markdown);
        const readmeBody = document.querySelector(".readme-body");
        if (readmeBody) {
            readmeBody.innerHTML = html;
        }
    } catch (error) {
        console.error("Failed to load README:", error);
    }
}

// Load assets data
async function loadAssets() {
    try {
        const response = await fetch("assets.json");
        if (!response.ok) {
            console.warn("assets.json not found, using empty data");
            state.data = [];
            render();
            return;
        }
        const json = await response.json();
        state.data = json.assets || [];

        // Extract tags from names if not provided
        state.data.forEach(asset => {
            if (!asset.tags) {
                asset.tags = [];
            }
            // Add theme as a tag
            const theme = extractTheme(asset.name);
            if (theme && !asset.tags.includes(theme)) {
                asset.tags.push(theme);
            }
            // Add type as a tag
            if (asset.type && !asset.tags.includes(asset.type)) {
                asset.tags.push(asset.type);
            }
            // Add size as a tag if available
            if (asset.size && !asset.tags.includes(`${asset.size}x${asset.size}`)) {
                asset.tags.push(`${asset.size}x${asset.size}`);
            }
        });

        // Populate size filter
        populateSizeFilter();

        render();
        renderTags();
    } catch (error) {
        console.error("Failed to load assets:", error);
        state.data = [];
        render();
    }
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
    initDarkMode();

    // Dark mode toggle
    document.getElementById("darkModeToggle")?.addEventListener("click", toggleDarkMode);

    // Search
    const searchInput = document.getElementById("search");
    if (searchInput) {
        const params = getParams();
        state.q = params.q;
        state.tags = new Set(params.tags);
        state.type = params.type;
        state.size = params.size;

        if (state.q) searchInput.value = state.q;
        if (state.type) {
            const typeSelect = document.getElementById("typeFilter");
            if (typeSelect) typeSelect.value = state.type;
        }
        if (state.size) {
            const sizeSelect = document.getElementById("sizeFilter");
            if (sizeSelect) sizeSelect.value = state.size;
        }

        searchInput.addEventListener("input", (e) => {
            state.q = e.target.value;
            setParams();
            render();
        });
    }

    // Type filter
    const typeFilter = document.getElementById("typeFilter");
    if (typeFilter) {
        typeFilter.addEventListener("change", (e) => {
            state.type = e.target.value;
            setParams();
            render();
        });
    }

    // Size filter
    const sizeFilter = document.getElementById("sizeFilter");
    if (sizeFilter) {
        sizeFilter.addEventListener("change", (e) => {
            state.size = e.target.value;
            setParams();
            render();
        });
    }

    // Tags toggle
    document.getElementById("tagsToggle")?.addEventListener("click", toggleTags);

    // README toggle
    document.getElementById("readmeToggle")?.addEventListener("click", toggleReadme);

    // Back to top
    initBackToTop();

    // Load README and assets
    loadReadme();
    loadAssets();
});
