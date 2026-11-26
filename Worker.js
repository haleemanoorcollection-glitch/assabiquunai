export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/generate') {
      return new Response('Not found', { status: 404, headers: corsHeaders });
    }

    try {
      const body = await request.json();
      const { userImage, templateUrl, name, templateTitle } = body;

      if (!userImage || !templateUrl) {
        return new Response(JSON.stringify({ error: 'Missing image or template' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Build the prompt for FLUX.2 [flex]
      const prompt = `Create a 1:1 WhatsApp DP image. Reference Image 1 is the user's personal photo. Reference Image 2 is the selected DP template ("${templateTitle}").

Use the person from Reference Image 1 and adapt/replace the person in Reference Image 2 with the user from Reference Image 1. Preserve identity, facial features, natural appearance, pose direction, clothing/hijab style, realistic proportions. Integrate seamlessly into the template scene.

Preserve the template's complete visual design: background, environment, colors, lighting, decorations, flowers, architecture, typography style, composition, icons, and ALL existing motivational text exactly as they are. Do NOT redesign, remove, rewrite, translate, or add any text.

Replace only the placeholder "YOUR NAME" with "${name}". Final output must be a polished 1:1 WhatsApp DP image.`;

      // Call FLUX.2 [flex] via Workers AI binding
      // The AI binding is configured in the Worker settings (no API token needed in code)
      const aiResponse = await env.AI.run('@cf/black-forest-labs/flux-2-flex', {
        prompt: prompt,
        input_images: [userImage, templateUrl],  // base64 + HTTPS URL
        width: 1024,
        height: 1024,
        steps: 28,
        guidance: 3.5,
        output_format: 'png'
      });

      // FLUX.2 [flex] returns image as base64 string or URL depending on binding
      // The binding returns the generated image; we pass it back
      if (aiResponse && aiResponse.image) {
        return new Response(JSON.stringify({ image: aiResponse.image }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Some bindings return a ReadableStream — convert to base64
      if (aiResponse instanceof ReadableStream) {
        const reader = aiResponse.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const blob = new Blob(chunks);
        const buffer = await blob.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        return new Response(JSON.stringify({ image: `data:image/png;base64,${base64}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'No image returned from model' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || 'Generation failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};