import { expect, test } from '@playwright/test';
import { ADMIN, createProduct, registerViaUi, stockOf } from './helpers';

test.describe('admin and access control', () => {
  test('customers cannot see or open admin pages', async ({ page }) => {
    await registerViaUi(page);
    await expect(page.getByRole('link', { name: 'Products and stock' })).toHaveCount(0);

    await page.goto('/admin/products');
    await expect(page.getByRole('heading', { name: 'Admin access required' })).toBeVisible();
  });

  test('an admin can raise stock and the change is real', async ({ page, request }) => {
    const product = await createProduct(request, { stock: 5 });
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.getByRole('link', { name: 'Products and stock' }).click();
    const row = page.getByRole('row', { name: new RegExp(product.name) });
    await expect(row.getByTestId('stock')).toHaveText('5');
    await row.getByRole('button', { name: `Increase ${product.name} stock by 10` }).click();

    await expect(row.getByTestId('stock')).toHaveText('15');
    expect(await stockOf(request, product.id)).toBe(15);
  });
});
