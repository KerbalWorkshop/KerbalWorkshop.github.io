function toggleModal(forceClose = false) {
    const modal = document.getElementById('mobileModal') || document.getElementById('modal');
    const backdrop = document.getElementById('modalBackdrop') || document.getElementById('modal-backdrop');
    if (!modal || !backdrop) return;
    const isOpen = modal.classList.contains('open');
    if (forceClose || isOpen) {
        modal.classList.remove('open');
        backdrop.classList.remove('open');
        document.body.classList.remove('modal-open');
    } else {
        modal.classList.add('open');
        backdrop.classList.add('open');
        document.body.classList.add('modal-open');
    }
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
            <img id="modal-main-image" src="${data.fullImageSrc}" alt="${data.label}" data-original-width="${data.originalWidth}" data-original-height="${data.originalHeight}">
            <svg id="bbox-highlighter-svg"><ellipse/></svg>
        </div>
        <div class="modal-image-details">${pillsHtml}${detailsHtml}</div>`;

    const highlighter = document.getElementById('bbox-highlighter-svg');
    const modalImage = document.getElementById('modal-main-image');
    
    modalImage.onload = () => {
        document.querySelectorAll('.subject-pill').forEach(pill => {
            const bbox = pill.dataset.bbox;
            if (bbox && bbox !== 'null') {
                pill.addEventListener('mouseenter', () => showHighlighter(bbox, modalImage, highlighter));
                pill.addEventListener('mouseleave', () => hideHighlighter(highlighter));
                pill.addEventListener('click', () => clickHighlighter(bbox, modalImage, highlighter));
            }
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
    document.body.style.position = ''; 
    document.body.style.top = ''; 
    document.body.style.width = '';
    window.scrollTo(0, scrollY);
}

function handleBackdropClick(e) { 
    if (e.target.id === 'gallery-modal') {
        closeModal(); 
    }
}

document.addEventListener('keydown', e => { 
    if (e.key === 'Escape') {
        closeModal();
    }
});

function showHighlighter(bbox, modalImage, svg) {
    const origW = parseInt(modalImage.dataset.originalWidth, 10);
    if (isNaN(origW) || !origW) return;

    const rect = modalImage.getBoundingClientRect();
    const scale = rect.width / origW;
    const coords = bbox.split(',').map(Number);
    if (coords.length < 8) return;

    const p1 = {x: coords[0], y: coords[1]}, p2 = {x: coords[2], y: coords[3]};
    const width = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) * scale;
    const height = Math.sqrt(Math.pow(coords[6] - p1.x, 2) + Math.pow(coords[7] - p1.y, 2)) * scale;
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
    const centerX = (p1.x + coords[4]) / 2 * scale;
    const centerY = (p1.y + coords[5]) / 2 * scale;
    
    const ellipse = svg.querySelector('ellipse');
    ellipse.setAttribute('cx', centerX);
    ellipse.setAttribute('cy', centerY);
    ellipse.setAttribute('rx', width / 2);
    ellipse.setAttribute('ry', height / 2);
    ellipse.setAttribute('transform', `rotate(${angle}, ${centerX}, ${centerY})`);
    
    svg.classList.add('visible');
}

function hideHighlighter(svg) { 
    if (svg.dataset.clickVisible !== 'true') {
        svg.classList.remove('visible'); 
    }
}

function clickHighlighter(bbox, modalImage, svg) {
    clearTimeout(clickTimeoutId);
    svg.dataset.clickVisible = 'true';
    showHighlighter(bbox, modalImage, svg);
    clickTimeoutId = setTimeout(() => {
        svg.dataset.clickVisible = 'false';
        hideHighlighter(svg);
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    const galleryModal = document.getElementById('gallery-modal');
    const modalCloseButton = document.getElementById('modal-close-button');
    if (galleryModal) {
        galleryModal.addEventListener('click', (e) => { 
            if (e.target === galleryModal) closeModal(); 
        });
    }
    if(modalCloseButton) {
        modalCloseButton.addEventListener('click', closeModal);
    }
});