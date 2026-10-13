import { config, storeProviderName, hasSupplier, hasAds } from '../config.ts';
import { CjSupplier } from './cj.ts';
import { DemoSupplier, DemoStore, DemoAds } from './demo.ts';
import { ShopifyStore } from './shopify.ts';
import { WooStore } from './woocommerce.ts';
import { MetaAds } from './meta.ts';
import type { SupplierProvider, StoreProvider, AdsProvider } from './types.ts';

export interface Providers { supplier: SupplierProvider; store: StoreProvider; ads: AdsProvider }

export function buildProviders(): Providers {
  const supplier: SupplierProvider = hasSupplier() ? new CjSupplier() : new DemoSupplier();
  const sp = storeProviderName();
  const store: StoreProvider = sp === 'shopify' ? new ShopifyStore() : sp === 'woocommerce' ? new WooStore() : new DemoStore();
  const ads: AdsProvider = hasAds() ? new MetaAds() : new DemoAds();
  return { supplier, store, ads };
}
