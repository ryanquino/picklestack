import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import QRCodeDisplay from './QRCodeDisplay';

vi.mock('qrcode', () => ({
  default: {
    toString: vi.fn(),
  },
}));

import QRCode from 'qrcode';

const mockedToString = QRCode.toString as unknown as ReturnType<typeof vi.fn>;

describe('QRCodeDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful SVG rendering', () => {
    it('renders SVG content when QRCode.toString succeeds', async () => {
      const fakeSvg = '<svg width="160" height="160"><rect /></svg>';
      mockedToString.mockResolvedValue(fakeSvg);

      const { container } = render(<QRCodeDisplay url="https://example.com/live/123" />);

      await waitFor(() => {
        const svgElement = container.querySelector('svg');
        expect(svgElement).toBeInTheDocument();
      });
    });

    it('renders container with correct dimensions matching size prop', async () => {
      const fakeSvg = '<svg><rect /></svg>';
      mockedToString.mockResolvedValue(fakeSvg);

      render(<QRCodeDisplay url="https://example.com/live/123" size={200} />);

      await waitFor(() => {
        const container = screen.getByLabelText('QR code for https://example.com/live/123');
        expect(container).toHaveStyle({ width: '200px', height: '200px' });
      });
    });

    it('enforces minimum size of 128px when size prop is smaller', async () => {
      const fakeSvg = '<svg><rect /></svg>';
      mockedToString.mockResolvedValue(fakeSvg);

      render(<QRCodeDisplay url="https://example.com/live/123" size={64} />);

      await waitFor(() => {
        const container = screen.getByLabelText('QR code for https://example.com/live/123');
        expect(container).toHaveStyle({ width: '128px', height: '128px' });
      });
    });

    it('uses default size of 160px when no size prop is provided', async () => {
      const fakeSvg = '<svg><rect /></svg>';
      mockedToString.mockResolvedValue(fakeSvg);

      render(<QRCodeDisplay url="https://example.com/live/abc" />);

      await waitFor(() => {
        const container = screen.getByLabelText('QR code for https://example.com/live/abc');
        expect(container).toHaveStyle({ width: '160px', height: '160px' });
      });
    });

    it('has aria-label containing the URL', async () => {
      const fakeSvg = '<svg><rect /></svg>';
      mockedToString.mockResolvedValue(fakeSvg);

      render(<QRCodeDisplay url="https://example.com/live/xyz" />);

      await waitFor(() => {
        expect(screen.getByLabelText('QR code for https://example.com/live/xyz')).toBeInTheDocument();
      });
    });

    it('calls QRCode.toString with correct parameters', async () => {
      const fakeSvg = '<svg><rect /></svg>';
      mockedToString.mockResolvedValue(fakeSvg);

      render(<QRCodeDisplay url="https://example.com/live/test" size={200} />);

      await waitFor(() => {
        expect(mockedToString).toHaveBeenCalledWith(
          'https://example.com/live/test',
          { type: 'svg', errorCorrectionLevel: 'H', width: 200 }
        );
      });
    });
  });

  describe('error fallback', () => {
    it('displays "QR code unavailable" text when generation fails', async () => {
      mockedToString.mockRejectedValue(new Error('Generation failed'));

      render(<QRCodeDisplay url="https://example.com/live/fail" />);

      await waitFor(() => {
        expect(screen.getByText('QR code unavailable')).toBeInTheDocument();
      });
    });

    it('displays the URL in a code element when generation fails', async () => {
      mockedToString.mockRejectedValue(new Error('Generation failed'));

      render(<QRCodeDisplay url="https://example.com/live/fail" />);

      await waitFor(() => {
        const codeElement = screen.getByText('https://example.com/live/fail');
        expect(codeElement.tagName).toBe('CODE');
      });
    });

    it('has aria-label indicating QR code is unavailable', async () => {
      mockedToString.mockRejectedValue(new Error('Generation failed'));

      render(<QRCodeDisplay url="https://example.com/live/fail" />);

      await waitFor(() => {
        expect(screen.getByLabelText('QR code unavailable')).toBeInTheDocument();
      });
    });
  });
});
