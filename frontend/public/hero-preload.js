      if (window.location.pathname === "/") {
        var heroPreload = document.createElement("link");
        heroPreload.rel = "preload";
        heroPreload.as = "image";
        heroPreload.setAttribute("imagesrcset", "/images/landing/sunset-hero-images/hero-480.webp 480w, /images/landing/sunset-hero-images/hero-800.webp 800w, /images/landing/sunset-hero-images/hero-1280.webp 1280w, /images/landing/sunset-hero-images/hero-1672.webp 1672w");
        heroPreload.setAttribute("imagesizes", "(max-width: 1199px) max(178svh, 100vw), 100vw");
        heroPreload.setAttribute("fetchpriority", "high");
        document.head.appendChild(heroPreload);
      }
