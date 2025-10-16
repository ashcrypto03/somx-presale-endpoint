// api/somx.js
// Reads total raised from coin-balance-history, returns presale stats with each new buy.

const CONTRACT = '0x622386489BCbc8Ee78557637073407343053a566';
const TXS_URL =
  `https://mainnet.somnia.w3us.site/api/v2/addresses/${CONTRACT}/transactions?filter=to%20%7C%20from`;
const BAL_HISTORY_URL =
  `https://mainnet.somnia.w3us.site/api/v2/addresses/${CONTRACT}/coin-balance-history`;

module.exports = async (req, res) => {
  try {
    const sinceBlock = Number(req.query?.sinceBlock ?? 0);
    const watermark = Number.isFinite(sinceBlock) ? sinceBlock : 0;

    // fetch both in parallel
    const [txResp, balResp] = await Promise.all([
      fetch(TXS_URL, { headers: { accept: 'application/json' }, cache: 'no-store' }),
      fetch(BAL_HISTORY_URL, { headers: { accept: 'application/json' }, cache: 'no-store' }),
    ]);

    if (!txResp.ok) return res.status(502).json({ success: false, error: `Explorer ${txResp.status}` });
    if (!balResp.ok) return res.status(502).json({ success: false, error: `Balance API ${balResp.status}` });

    const txData = await txResp.json();
    const balData = await balResp.json();

    // ---- total raised from coin-balance-history
    // Take newest item; fall back to 0 if missing
    const latest = Array.isArray(balData.items) && balData.items[0] ? balData.items[0] : null;

    const totalRaisedWei = latest?.value ? String(latest.value) : '0';

    // wei -> SOMI helpers
    const ONE_ETHER = 1000000000000000000n;
    const toSomi = (weiStr) => {
      try {
        const wei = BigInt(String(weiStr).replace(/[^\d]/g, '') || '0');
        // return JS number (may lose precision on huge values, OK for display)
        return Number(wei) / 1e18;
      } catch {
        return 0;
      }
    };
    const toSomiStr4 = (weiStr) => {
      try {
        const wei = BigInt(String(weiStr).replace(/[^\d]/g, '') || '0');
        const whole = wei / ONE_ETHER;
        const frac  = wei % ONE_ETHER;
        const frac4 = (frac * 10000n) / ONE_ETHER;
        return `${whole}.${frac4.toString().padStart(4, '0')}`;
      } catch { return '0'; }
    };

    const totalRaised = toSomi(totalRaisedWei); // number for math

    // ---- tier logic using your rules
    const TARGET = 2_500_000;
    const progress = Math.max(0, Math.min(100, (totalRaised / TARGET) * 100));
    let tier, bonusPct, priceSOMI;
    if (progress <= 10)      { tier = 1; bonusPct = 5.0;  priceSOMI = 0.02500; }
    else if (progress <= 30) { tier = 2; bonusPct = 2.5;  priceSOMI = 0.02625; }
    else if (progress <= 50) { tier = 3; bonusPct = 1.2;  priceSOMI = 0.02756; }
    else                     { tier = 4; bonusPct = 0.0;  priceSOMI = 0.02894; }

    // ---- new buys since watermark
    const items = Array.isArray(txData.items) ? txData.items : [];
    items.sort((a, b) => Number(a?.block_number || 0) - Number(b?.block_number || 0));

    let newestBlock = watermark;
    const txs = [];

    for (const tx of items) {
      if (tx?.method !== 'buyTokens') continue;
      const ok = tx?.status === 'ok' || tx?.result === 'success';
      if (!ok) continue;

      const block = Number(tx?.block_number ?? 0);
      if (!Number.isFinite(block) || block <= watermark) continue;

      txs.push({
        buyer: tx?.from?.hash || 'unknown',
        amountSOMI: toSomiStr4(tx?.value), // 4dp string; you format to 2dp in n8n
        txHash: tx?.hash || '',
        block,
        timestamp: tx?.timestamp || null,
        explorerLink: tx?.hash ? `https://explorer.somnia.network/tx/${tx.hash}` : null,
        presale: {
          totalRaised,                       // number (SOMI)
          progressPct: Number(progress.toFixed(2)),
          tier,
          bonusPct,
          priceSOMI,
        },
      });

      if (block > newestBlock) newestBlock = block;
    }

    res.status(200).json({
      success: true,
      newestBlock,
      count: txs.length,
      transactions: txs,
    });
  } catch (err) {
    console.error('somx endpoint error:', err);
    res.status(500).json({ success: false, error: String(err?.message || err) });
  }
};
