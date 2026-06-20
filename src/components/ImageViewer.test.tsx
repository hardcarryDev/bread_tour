import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ImageViewer, { type ViewerImage } from './ImageViewer';

const images: ViewerImage[] = [
  { url: 'https://example.com/a.jpg', alt: '소금빵' },
  { url: 'https://example.com/b.jpg', alt: '소금빵' },
  { url: 'https://example.com/c.jpg', alt: '소금빵' },
];

describe('ImageViewer (in-app lightbox)', () => {
  it('renders nothing when there are no images', () => {
    const { container } = render(
      <ImageViewer
        images={[]}
        index={0}
        onClose={vi.fn()}
        onIndexChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('image-viewer')).not.toBeInTheDocument();
  });

  it('renders the current image at the given index', () => {
    render(
      <ImageViewer
        images={images}
        index={1}
        onClose={vi.fn()}
        onIndexChange={vi.fn()}
      />,
    );
    const img = screen.getByTestId('image-viewer-img');
    expect(img).toHaveAttribute('src', 'https://example.com/b.jpg');
    expect(img).toHaveAttribute('alt', '소금빵');
    // Counter reflects 1-based position out of the total.
    expect(screen.getByTestId('image-viewer-counter')).toHaveTextContent('2 / 3');
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <ImageViewer
        images={images}
        index={0}
        onClose={onClose}
        onIndexChange={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('image-viewer-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    render(
      <ImageViewer
        images={images}
        index={0}
        onClose={onClose}
        onIndexChange={vi.fn()}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('next advances the index', async () => {
    const onIndexChange = vi.fn();
    render(
      <ImageViewer
        images={images}
        index={0}
        onClose={vi.fn()}
        onIndexChange={onIndexChange}
      />,
    );
    await userEvent.click(screen.getByTestId('image-viewer-next'));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it('next wraps around from the last image to the first', async () => {
    const onIndexChange = vi.fn();
    render(
      <ImageViewer
        images={images}
        index={2}
        onClose={vi.fn()}
        onIndexChange={onIndexChange}
      />,
    );
    await userEvent.click(screen.getByTestId('image-viewer-next'));
    expect(onIndexChange).toHaveBeenCalledWith(0);
  });

  it('prev wraps around from the first image to the last', async () => {
    const onIndexChange = vi.fn();
    render(
      <ImageViewer
        images={images}
        index={0}
        onClose={vi.fn()}
        onIndexChange={onIndexChange}
      />,
    );
    await userEvent.click(screen.getByTestId('image-viewer-prev'));
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });

  it('hides navigation and counter for a single image', () => {
    render(
      <ImageViewer
        images={[images[0]]}
        index={0}
        onClose={vi.fn()}
        onIndexChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('image-viewer-next')).not.toBeInTheDocument();
    expect(screen.queryByTestId('image-viewer-prev')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('image-viewer-counter'),
    ).not.toBeInTheDocument();
  });

  it('closes when the dark backdrop is clicked but not when the image is clicked', async () => {
    const onClose = vi.fn();
    render(
      <ImageViewer
        images={images}
        index={0}
        onClose={onClose}
        onIndexChange={vi.fn()}
      />,
    );
    // Clicking the image must NOT close the viewer.
    await userEvent.click(screen.getByTestId('image-viewer-img'));
    expect(onClose).not.toHaveBeenCalled();
    // Clicking the overlay backdrop itself closes it.
    await userEvent.click(screen.getByTestId('image-viewer'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
