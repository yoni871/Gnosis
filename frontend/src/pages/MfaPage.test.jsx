import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import AuthContext from '../context/AuthContext';
import MfaPage from './MfaPage';

function response(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const codes = [
    'ABCD-EFGH-IJKL', 'MNOP-QRST-UVWX', 'YZAB-CDEF-GHIJ', 'KLMN-OPQR-STUV',
    'WXYZ-1234-5678', '9ABC-DEFG-HIJK', 'LMNO-PQRS-TUVW', 'XYZA-BCDE-FGHI',
    'JKLM-NOPQ-RSTU', 'VWXY-ZABC-DEFG',
];

function renderPage({ authenticated = true, enrolled = false } = {}) {
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
        const path = String(url);
        if (path.endsWith('/auth/mfa/status')) {
            return Promise.resolve(response({ enrolled }));
        }
        if (path.endsWith('/auth/mfa/enroll') && options.method === 'POST') {
            return Promise.resolve(response({
                otpauthUrl: 'otpauth://totp/Gnosis:reader%40example.invalid?secret=JBSWY3DPEHPK3PXP&issuer=Gnosis',
                secret: 'JBSWY3DPEHPK3PXP',
            }));
        }
        if (path.endsWith('/auth/mfa/enroll/confirm')) {
            return Promise.resolve(response({ enrolled: true, recoveryCodes: codes }));
        }
        if (path.endsWith('/auth/mfa/recovery-codes/regenerate')) {
            return Promise.resolve(response({ recoveryCodes: codes.map((code) => `NEW-${code}`) }));
        }
        if (path.endsWith('/auth/mfa/disable')) {
            return Promise.resolve(response({ enrolled: false }));
        }
        throw new Error(`Unexpected request: ${path}`);
    }));
    render(<MemoryRouter><AuthContext.Provider value={{
        user: { id: 7, email: 'reader@example.invalid' },
        getAccessToken: () => 'test-token',
        isAuthenticated: authenticated,
        isAuthLoading: false,
    }}><MfaPage /></AuthContext.Provider></MemoryRouter>);
}

test('enrollment flow shows the secret once, then the recovery codes once', async () => {
    renderPage({ enrolled: false });
    const user = userEvent.setup();

    await screen.findByText('Two-factor authentication is off');
    await user.click(screen.getByRole('button', { name: /set up two-factor authentication/i }));

    await screen.findByText('Add Gnosis to your authenticator app');
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(screen.getByText(/No QR code is shown yet/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Code from your authenticator app'), '123456');
    await user.click(screen.getByRole('button', { name: /confirm and turn on/i }));

    await screen.findByText(/Save your recovery codes below/);
    expect(screen.getByText('ABCD-EFGH-IJKL')).toBeInTheDocument();
    expect(screen.getByText('Two-factor authentication is on')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /i've saved my recovery codes/i }));
    expect(screen.queryByText('ABCD-EFGH-IJKL')).not.toBeInTheDocument();
});

test('enrolled state offers regenerate and disable', async () => {
    renderPage({ enrolled: true });
    const user = userEvent.setup();

    await screen.findByText('Two-factor authentication is on');
    expect(screen.getByRole('button', { name: /issue new recovery codes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /turn off two-factor authentication/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Password', { selector: '#mfa-regen-password' }), 'synthetic-password');
    await user.type(screen.getByLabelText('Code from your authenticator app', { selector: '#mfa-regen-code' }), '123456');
    await user.click(screen.getByRole('button', { name: /issue new recovery codes/i }));

    await screen.findByText(/New recovery codes issued/);
    expect(screen.getByText('NEW-ABCD-EFGH-IJKL')).toBeInTheDocument();
});

test('unauthenticated visitors are pointed at sign in', async () => {
    renderPage({ authenticated: false });
    await screen.findByRole('link', { name: /sign in/i });
    expect(screen.queryByText(/Two-factor authentication is off/)).not.toBeInTheDocument();
});
