module.exports = async (req, res) => {
  try {
    const EXPLORER_URL =
      'https://mainnet.somnia.w3us.site/api/v2/addresses/0x622386489BCbc8Ee78557637073407343053a566/transactions?filter=to%20%7C%20from';

    const r = await fetch(EXPLORER_URL, { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) return res.status(502).json({ success: false, error: `Explorer ${r.status}` });

    const data = await r.json();
    const list = Array.isArray(data.items) ? data.items : [];

    const weiToSomi = (weiStr) => {
      try {
        const wei = BigInt(String(weiStr));
        const whole = wei / 1000000000000000000n;
        const frac  = wei % 1000000000000000000n;
        const frac4 = (frac * 10000n) / 1000000000000000000n;
        return `${whole}.${frac4.toString().padStart(4, '0')}`;
      } catch {
        return '0';
      }
    };

    const buys = list
      .filter((tx) => tx?.method === 'buyTokens' && (tx?.status === 'ok' || tx?.result === 'success'))
      .map((tx) => ({
        buyer: tx.from?.hash || 'unknown',
        amountSOMI: weiToSomi(tx.value),
        txHash: tx.hash,
        block: Number(tx.block_number || 0),
        timestamp: tx.timestamp,
        explorerLink: `https://explorer.somnia.network/tx/${tx.hash}`,
      }))
      .sort((a, b) => b.block - a.block);

    res.status(200).json({ success: true, transactions: buys });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
