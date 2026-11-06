import "./LandingDeviceShowcase.css";

// Device shells are a separate photographic-style asset. Actual screenshots
// remain ordinary images, independently inspectable and unchanged.
export default function LandingDeviceShowcase() {
    return (
        <figure className="landing-device-showcase" aria-label="Gnosis on one laptop and one smartphone">
            <img className="landing-device-setting" src="/images/landing/device-showcase/devices-1536.jpg" srcSet="/images/landing/device-showcase/devices-900.jpg 900w, /images/landing/device-showcase/devices-1536.jpg 1536w" sizes="(min-width: 900px) 60vw, 100vw" width="1536" height="1024" loading="lazy" decoding="async" alt="" />
            <div className="landing-device-laptop-screen">
                <div className="landing-device-desktop-crop">
                    <img src="/images/landing/bible-commentary/reader-1920.jpg" width="1920" height="1200" loading="lazy" decoding="async" alt="The actual Gnosis reader showing Genesis 1 in the KJV beside Matthew Henry's commentary" />
                </div>
            </div>
            <div className="landing-device-phone-screen">
                <img src="/images/landing/bible-commentary/mobile-scripture-856.jpg" width="856" height="1852" loading="lazy" decoding="async" alt="Gnosis mobile Scripture view showing John 1 in the KJV" />
            </div>
        </figure>
    );
}
