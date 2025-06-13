function toggleModal() {
  const modal = document.getElementById('mobileModal') || document.getElementById('modal');
  const backdrop = document.getElementById('modalBackdrop') || document.getElementById('modal-backdrop');
  modal.classList.toggle('open');
  backdrop.classList.toggle('open');
  document.body.classList.toggle('modal-open');
}


// --- Universal Gallery Modal Logic ---
let scrollY = 0;
let clickTimeoutId = null;

function openModal(data) {
    const modal = document.getElementById('gallery-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    if (!modal || !modalTitle || !modalBody) return;

    modalTitle.textContent = data.label;

    let pillsHtml = '';
    if (data.subjects && data.subjects.length > 0) {
        pillsHtml += '<div class="subject-pills-container">';
        data.subjects.forEach(sub => {
            pillsHtml += `<span class="subject-pill" data-bbox="${sub.bounding_box}" data-name="${sub.name}">${sub.name}</span>`;
        });
        pillsHtml += '</div>';
    }

    let detailsHtml = '';
    const details = [
        { key: 'date', name: 'Date' }, { key: 'camera', name: 'Camera' },
        { key: 'telescope', name: 'Telescope' }, { key: 'integration', name: 'Integration', unit: ' min' },
        { key: 'notes', name: 'Notes', full: true }
    ];
    details.forEach(d => {
        const value = data.details[d.key];
        if (value && value !== 'None' && value !== 'null') {
            const displayValue = d.unit ? value + d.unit : value;
            detailsHtml += `<p class="detail-item ${d.full ? 'detail-item-full' : ''}"><strong>${d.name}:</strong> ${displayValue}</p>`;
        }
    });

    modalBody.innerHTML = `
        <div class="modal-image-container">
            <img id="modal-main-image" src="${data.fullImageSrc}" alt="${data.label}" data-original-width="${data.originalWidth}">
            <div id="bbox-highlighter"></div>
        </div>
        <div class="modal-image-details">${pillsHtml}${detailsHtml}</div>`;

    const highlighter = document.getElementById('bbox-highlighter');
    const modalImage = document.getElementById('modal-main-image');
    
    modalImage.onload = () => {
        document.querySelectorAll('.subject-pill').forEach(pill => {
            const bbox = pill.dataset.bbox;
            if (bbox && bbox !== 'null') {
                pill.addEventListener('mouseenter', () => showHighlighter(bbox, modalImage, highlighter));
                pill.addEventListener('mouseleave', () => hideHighlighter(highlighter));
                pill.addEventListener('click', () => clickHighlighter(bbox, modalImage, highlighter));
            } else { pill.style.cursor = 'default'; pill.style.opacity = '0.6'; }
        });
    };

    scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('gallery-modal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.position = ''; document.body.style.top = ''; document.body.style.width = '';
    window.scrollTo(0, scrollY);
}

function handleBackdropClick(e) { if (e.target.id === 'gallery-modal') closeModal(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function showHighlighter(bbox, modalImage, highlighter) {
    const origW = parseInt(modalImage.dataset.originalWidth, 10);
    if (isNaN(origW) || !origW) return;
    const rect = modalImage.getBoundingClientRect();
    const dispW = rect.width;
    const scale = dispW / origW;
    const [x1, y1, x2, y2] = bbox.split(',').map(Number);
    const radius = ((x2 - x1) * scale) / 2;
    const centerX = ((x1 + x2) / 2) * scale;
    const centerY = ((y1 + y2) / 2) * scale;
    highlighter.style.width = `${radius * 2}px`;
    highlighter.style.height = `${radius * 2}px`;
    highlighter.style.left = `${centerX - radius}px`;
    highlighter.style.top = `${centerY - radius}px`;
    highlighter.classList.add('visible');
}

function hideHighlighter(highlighter) {
    if (highlighter.dataset.clickVisible !== 'true') {
        highlighter.classList.remove('visible');
    }
}

function clickHighlighter(bbox, modalImage, highlighter) {
    clearTimeout(clickTimeoutId);
    highlighter.dataset.clickVisible = 'true';
    showHighlighter(bbox, modalImage, highlighter);
    clickTimeoutId = setTimeout(() => {
        highlighter.dataset.clickVisible = 'false';
        hideHighlighter(highlighter);
    }, 500);
}