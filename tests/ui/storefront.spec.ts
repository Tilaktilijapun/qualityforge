import { expect, test } from '@playwright/test';
import { createProduct, findProduct, registerViaUi, stockOf } from './helpers';

test.describe('customer journey', () => {
  test('search → add to cart → checkout → order confirmation', async ({ page, request }) => {
    const product = await createProduct(request, { priceCents: 2500, stock: 5 });
    await registerViaUi(page);

    const row = await findProduct(page, product.name);
    await expect(row).toContainText('$25.00');
    await row.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByRole('status')).toContainText(`Added ${product.name}`);

    await page.getByRole('link', { name: 'Cart' }).click();
    await expect(page.getByRole('row', { name: new RegExp(product.name) })).toBeVisible();
    await page.getByRole('button', { name: 'Place order' }).click();

    await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible();
    await expect(page.getByTestId('order-status')).toContainText('Paid');
    expect(await stockOf(request, product.id)).toBe(4);
  });

  test('declined payment keeps the cart and does not take stock', async ({ page, request }) => {
    const product = await createProduct(request, { stock: 5 });
    await registerViaUi(page);
    await (await findProduct(page, product.name)).getByRole('button', { name: 'Add to cart' }).click();
    await page.getByRole('link', { name: 'Cart' }).click();

    await page.getByLabel('Test payment outcome').selectOption('declined');
    await page.getByRole('button', { name: 'Place order' }).click();

    await expect(page.getByRole('alert')).toContainText('Payment was declined');
    await expect(page.getByRole('row', { name: new RegExp(product.name) })).toBeVisible();
    expect(await stockOf(request, product.id)).toBe(5);
  });

  test('cancelling an order restores stock', async ({ page, request }) => {
    const product = await createProduct(request, { stock: 5 });
    await registerViaUi(page);
    await (await findProduct(page, product.name)).getByRole('button', { name: 'Add to cart' }).click();
    await page.getByRole('link', { name: 'Cart' }).click();
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByRole('heading', { name: 'Order confirmed' })).toBeVisible();
    expect(await stockOf(request, product.id)).toBe(4);

    await page.getByRole('button', { name: 'Cancel order' }).click();
    await expect(page.getByTestId('order-status')).toContainText('Cancelled');
    expect(await stockOf(request, product.id)).toBe(5);
  });

  test('guests are sent to sign in when they try to add to cart', async ({ page, request }) => {
    const product = await createProduct(request);
    const row = await findProduct(page, product.name);
    await row.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('sold-out products cannot be added', async ({ page, request }) => {
    const product = await createProduct(request, { stock: 0 });
    const row = await findProduct(page, product.name);
    await expect(row).toContainText('Out of stock');
    await expect(row.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
  });
});
