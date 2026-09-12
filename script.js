/* ========================================
   Little Mill Middle School FBLA — Script
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {

  // ---- Mobile Navigation Toggle ----
  const navToggle = document.getElementById('navToggle');
  const navLinks  = document.getElementById('navLinks');

  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.classList.toggle('active');
    navToggle.setAttribute('aria-expanded', isOpen);
  });

  // Close mobile nav on link click
  navLinks.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.classList.remove('active');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  // ---- Navbar scroll effect ----
  const navbar = document.getElementById('navbar');

  const updateNavbar = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  };
  window.addEventListener('scroll', updateNavbar, { passive: true });
  updateNavbar();

  // ---- Active nav link on scroll ----
  const sections = document.querySelectorAll('section[id], header[id]');
  const navLinkElements = document.querySelectorAll('.nav-link');

  const updateActiveLink = () => {
    const scrollY = window.scrollY + 120;

    let currentSection = '';
    sections.forEach(section => {
      if (scrollY >= section.offsetTop) {
        currentSection = section.getAttribute('id');
      }
    });

    navLinkElements.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === `#${currentSection}`) {
        link.classList.add('active');
      }
    });
  };
  window.addEventListener('scroll', updateActiveLink, { passive: true });
  updateActiveLink();

  // ---- Animated stat counters ----
  const statNumbers = document.querySelectorAll('.stat-number[data-target]');
  let statsCounted = false;

  const countUp = (el) => {
    const target = parseInt(el.dataset.target, 10);
    const duration = 1500;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = Math.round(eased * target);
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  };

  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !statsCounted) {
        statsCounted = true;
        statNumbers.forEach(countUp);
      }
    });
  }, { threshold: 0.5 });

  const statsSection = document.querySelector('.hero-stats');
  if (statsSection) {
    statsObserver.observe(statsSection);
  }

  // ---- Fade-in on scroll ----
  const fadeTargets = document.querySelectorAll(
    '.about-card, .announcement-card, .minutes-card, .officer-card, .timeline-item, .join-step'
  );

  fadeTargets.forEach(el => el.classList.add('fade-in'));

  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  fadeTargets.forEach(el => fadeObserver.observe(el));

});
