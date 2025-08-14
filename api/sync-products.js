import fetch from 'node-fetch';

export default async function handler(request, response) {
  // This function is designed to be triggered by a scheduled job.
  console.log('Starting scheduled product sync...');

  try {
    // --- Step 1: Fetch Products from Maya Mobile with Basic Auth ---
    const mayaApiKey = process.env.MAYA_API_KEY;
    const mayaApiSecret = process.env.MAYA_API_SECRET;

    // Create the Basic Auth string: 'Api Key:Api Secret' base64 encoded
    const authString = Buffer.from(`${mayaApiKey}:${mayaApiSecret}`).toString('base64');
    
    // IMPORTANT: Use the correct API endpoint for fetching eSIM plans from their documentation
    const mayaResponse = await fetch('https://api.mayamobile.com/v1/products', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
    });

    if (!mayaResponse.ok) {
      const errorData = await mayaResponse.text();
      console.error('Maya Mobile API Error:', errorData);
      return response.status(500).json({ error: 'Failed to fetch products from Maya Mobile' });
    }
    
    const mayaProducts = await mayaResponse.json();
    console.log(`Fetched ${mayaProducts.length} products from Maya Mobile.`);

    // --- Step 2: Sync Products with Shopify ---
    const shopifyStoreName = process.env.SHOPIFY_STORE_NAME;
    const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    for (const mayaProduct of mayaProducts) {
      const productData = {
        title: `${mayaProduct.name || 'eSIM Plan'} - ${mayaProduct.data_quota_mb / 1024} GB`,
        body_html: `<p>A new eSIM plan from Maya Mobile. Data: ${mayaProduct.data_quota_mb} MB. Validity: ${mayaProduct.validity_days} days.</p>`,
        vendor: 'Maya Mobile',
        product_type: 'eSIM',
        published: true,
        variants: [
          {
            price: mayaProduct.rrp_usd,
            sku: mayaProduct.id,
            inventory_management: null,
            title: 'Default Title'
          },
        ],
      };

      // In a real implementation, you would first check if the product exists in Shopify
      // and update it if it does, or create it if it doesn't. This code simply creates.
      const shopifyResponse = await fetch(`https://${shopifyStoreName}.myshopify.com/admin/api/2023-01/products.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': shopifyAccessToken,
        },
        body: JSON.stringify({ product: productData }),
      });

      const shopifyJson = await shopifyResponse.json();

      if (!shopifyResponse.ok) {
        console.error(`Shopify Error for product ${mayaProduct.id}:`, shopifyJson.errors);
      } else {
        console.log(`Successfully created Shopify product for ${mayaProduct.id}: ${shopifyJson.product.id}`);
      }
    }

    return response.status(200).json({ message: 'Product sync complete' });

  } catch (error) {
    console.error('Sync process failed:', error);
    return response.status(500).json({ error: 'Internal Server Error' });
  }
}