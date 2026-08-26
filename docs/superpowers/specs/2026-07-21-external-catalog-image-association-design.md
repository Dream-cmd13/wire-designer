# External Catalog Image Association Design

## Goal

Remove every frontend workflow that uploads or manually associates 2D images. Catalog images are uploaded and associated outside the application, then the frontend only reads and displays them.

## Scope

- Remove visible text, controls, dialogs, and handlers for local image upload, PDF-crop image association, and manual 2D-image association.
- Keep 2D drawing/image display and its layout controls.
- Keep the catalog resource image pipeline: an external script uploads files to the private `catalog-assets` bucket and writes matching rows to `public.resource_item_images`.
- Continue using resource references and signed URLs loaded from Supabase to create display images for connector, wire, and overmold instances.
- Retain read compatibility for existing `HarnessConfig.twoDImages`; do not provide any frontend mutation path for it.

## Data Flow

1. An external script uploads a local image to `catalog-assets` with the configured resource path.
2. The script inserts or updates `resource_item_images` with the resource item ID, storage path, role, primary flag, and display order.
3. The frontend loads catalog resources and their signed image URLs from Supabase.
4. A resource selected in the harness designer carries its resource ID and image URL into the design document.
5. Existing automatic synchronization derives the display image from that resource reference. The 2D view displays it but never uploads, selects, or associates an image itself.

## Frontend Changes

- Remove `TwoDAssociateDialog` and every entry point that opens it.
- Remove local image-upload inputs and PDF-crop-to-image association actions.
- Remove user-facing copy that tells users to upload, add, or associate 2D images.
- Remove store actions that exist only to create, delete, or manually associate `twoDImages`, after confirming no remaining runtime consumer needs mutation support.
- Preserve 2D-view zoom, pan, placement, and display behavior for externally associated images.

## Database Impact

No schema change is required.

`resource_items` and `resource_item_images` already model the required external association. `drawing_documents.drawing_json` and project documents retain the rendered design state. A new table or column is unnecessary unless future requirements need independent database querying or reporting by per-project image association.

## Validation

- A catalog resource with a valid `resource_item_images` row renders in the 2D view.
- No frontend UI can upload an image or manually assign one to an element.
- No user-facing text includes “关联 2D 图”, “关联 2D 图片”, or an instruction to upload an image.
- Existing documents containing `twoDImages` still load without error.
- Type check, lint, unit tests, and production build pass.
