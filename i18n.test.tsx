import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider, LanguageToggle, useT } from '@/lib/i18n';

function Sample() {
  const { t } = useT();
  return <><LanguageToggle /><p data-testid="label">{t('Add stock')}</p><p data-testid="unknown">{t('Some text with no translation')}</p><p data-testid="status">{t('Cancelled')}</p></>;
}

describe('Hindi / English switch', () => {
  beforeEach(() => localStorage.clear());

  it('shows English by default', () => {
    render(<LanguageProvider><Sample /></LanguageProvider>);
    expect(screen.getByTestId('label').textContent).toBe('Add stock');
  });

  it('switches to Hindi, keeps untranslated text in English, and remembers the choice', () => {
    render(<LanguageProvider><Sample /></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'हिंदी' }));
    expect(screen.getByTestId('label').textContent).toBe('स्टॉक जोड़ें');
    expect(screen.getByTestId('status').textContent).toBe('रद्द');
    expect(screen.getByTestId('unknown').textContent).toBe('Some text with no translation');
    expect(localStorage.getItem('admin-language')).toBe('hi');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByTestId('label').textContent).toBe('Add stock');
  });
});
