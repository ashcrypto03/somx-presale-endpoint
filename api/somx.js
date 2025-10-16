// api/somx.js (CommonJS)
module.exports = async (req, res) => {
  try {
    // Parse watermark safely
    const sinceBlockParam = req.query?.sinceBlock;
    const sinceBlock = Number(sinceBlockParam ?? 0);
    const watermark = Number.isFinite(sinceBlock) ? sinceBlock : 0;

    const EXPLORER_URL =
      'https://mainnet.somnia.w3us.site/api/v2/addresses/0x622386489BCbc8Ee78557637073407343053a566/transactions?filter=to%20%7C%20from';

    const r = await fetch(EXPLORER_URL, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });

    if (!r.ok) {
      console.error('Explorer error status:', r.status);
      return res.status(502).json({ success: false, error: `Explorer ${r.status}` });
    }

    const data = await r.json();
    const items = Array.isArray(data.items) ? data.items : [];

    // wei → SOMI (1e18). Accepts string or number. Returns "0" on any issue.
    function safeWeiToSomi(val) {
      try {
        const s = typeof val === 'string' ? val : String(val ?? '0');
        // strip any stray non-digits (defensive)
        const clean = s.replace(/[^\d]/g, '');
        const wei = BigInt(clean.length ? clean : '0');
        const whole = wei / 1000000000000000000n;
        const frac = wei % 1000000000000000000n;
        const frac4 = (frac * 10000n) / 1000000000000000000n;
        return `${whole}.${frac4.toString().padStart(4, '0')}`;
      } catch (e) {
        console.error('safeWeiToSomi failed for value:', val, e);
        return '0';
      }
    }

    let newestBlock = watermark;
    const out = [];

    // Oldest → newest so watermark advances safely
    items.sort((a, b) => Number(a?.block_number || 0) - Number(b?.block_number || 0));

    for (const tx of items) {
      // Only successful buyTokens
      if (tx?.method !== 'buyTokens') continue;
      const ok = tx?.status === 'ok' || tx?.result === 'success';
      if (!ok) continue;

      const block = Number(tx?.block_number ?? 0);
      if (!Number.isFinite(block) || block <= watermark) continue;

      const value = tx?.value; // may be string or number
      const somi = safeWeiToSomi(value);

      out.push({
        buyer: tx?.from?.hash || 'unknown',
        amountSOMI: somi,
        txHash: tx?.hash || '',
        block,
        timestamp: tx?.timestamp || null,
        explorerLink: tx?.hash
          ? `https://explorer.somnia.network/tx/${tx.hash}`
          : null,
      });

      if (block > newestBlock) newestBlock = block;
    }

    return res.status(200).json({
      success: true,
      newestBlock,
      count: out.length,
      transactions: out,
    });
  } catch (err) {
    // Log full error to Vercel and return a concise message
    console.error('Handler failed:', err);
    return res.status(500).json({
      success: false,
      error: String(err?.message || err),
    });
  }
};
