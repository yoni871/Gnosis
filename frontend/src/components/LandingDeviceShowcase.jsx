import "./LandingDeviceShowcase.css";

// Device shells are a separate photographic-style asset. Actual screenshots
// remain ordinary images, independently inspectable and unchanged.
export default function LandingDeviceShowcase() {
    return (
        <figure className="landing-device-showcase" aria-label="Gnosis on one laptop and one smartphone">
            <img className="landing-device-setting" src="/images/landing/device-showcase/devices-1536.jpg" srcSet="/images/landing/device-showcase/devices-900.jpg 900w, /images/landing/device-showcase/devices-1536.jpg 1536w" sizes="(min-width: 900px) 60vw, 100vw" width="1536" height="1024" loading="lazy" decoding="async" alt="" />
            <div className="landing-device-laptop-screen">
                <div className="landing-device-desktop-crop">
                    {/* Responsive + WebP, mirroring the hero: the laptop
                        screen is 66% of the showcase (60vw on desktop,
                        100vw below 900px), so a phone loads the 960w
                        file instead of the full 1920w screenshot. The
                        picture is display:contents so the absolutely
                        positioned img keeps its existing layout. */}
                    <picture style={{ display: "contents" }}>
                        <source type="image/webp" srcSet="/images/landing/bible-commentary/reader-960.webp 960w, /images/landing/bible-commentary/reader-1920.webp 1920w" sizes="(min-width: 900px) 40vw, 66vw" />
                        <img src="/images/landing/bible-commentary/reader-1920.jpg" srcSet="/images/landing/bible-commentary/reader-960.jpg 960w, /images/landing/bible-commentary/reader-1920.jpg 1920w" sizes="(min-width: 900px) 40vw, 66vw" width="1920" height="1200" loading="lazy" decoding="async" alt="The actual Gnosis reader showing Genesis 1 in the KJV beside Matthew Henry's commentary" />
                    </picture>
                </div>
            </div>
            <div className="landing-device-phone-screen">
                {/* The phone screen is 13% of the showcase, so the 428w
                    file covers it at DPR 2 on desktop and on phones.
                    The picture fills the screen so the img's 100%
                    sizing resolves against it. */}
                <picture style={{ display: "block", width: "100%", height: "100%" }}>
                    <source type="image/webp" srcSet="/images/landing/bible-commentary/mobile-scripture-428.webp 428w, /images/landing/bible-commentary/mobile-scripture-856.webp 856w" sizes="(min-width: 900px) 8vw, 13vw" />
                    <img src="/images/landing/bible-commentary/mobile-scripture-856.jpg" srcSet="/images/landing/bible-commentary/mobile-scripture-428.jpg 428w, /images/landing/bible-commentary/mobile-scripture-856.jpg 856w" sizes="(min-width: 900px) 8vw, 13vw" width="856" height="1852" loading="lazy" decoding="async" alt="Gnosis mobile Scripture view showing John 1 in the KJV" />
                </picture>
            </div>
        </figure>
    );
}
