function toggleModal() {
  const modal = document.getElementById('mobileModal') || document.getElementById('modal');
  const backdrop = document.getElementById('modalBackdrop') || document.getElementById('modal-backdrop');
  modal.classList.toggle('open');
  backdrop.classList.toggle('open');
  document.body.classList.toggle('modal-open');
}
