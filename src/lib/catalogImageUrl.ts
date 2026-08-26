export interface CatalogStorageClient {
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, expiresIn: number): PromiseLike<{
        data: { signedUrl?: string } | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export const CATALOG_IMAGE_BUCKET = 'catalog-assets';
export const CATALOG_IMAGE_URL_TTL_SECONDS = 60 * 60;

export interface CatalogImageSignResult {
  signedUrl?: string;
  error?: string;
}

export async function signCatalogImageResult(
  client: CatalogStorageClient,
  path: string,
): Promise<CatalogImageSignResult> {
  const { data, error } = await client.storage
    .from(CATALOG_IMAGE_BUCKET)
    .createSignedUrl(path, CATALOG_IMAGE_URL_TTL_SECONDS);
  return error
    ? { error: error.message }
    : { signedUrl: data?.signedUrl };
}

export async function signCatalogImage(
  client: CatalogStorageClient,
  path: string,
): Promise<string | undefined> {
  return (await signCatalogImageResult(client, path)).signedUrl;
}
