import { useMemo, useState } from 'react';

import {
  PROTOCOL_VERSION,
  buildApprovedSessionPayload,
  decodeSessionApprovalRequest,
  type SessionApprovalRequest
} from '@zk-agent/agent-session-protocol';

function readFallbackParams(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  return {
    rid: params.get('rid') || '',
    wallet: params.get('wallet') || '',
    chain: params.get('chain') || '',
    chainId: params.get('chainId') || '',
    provider: params.get('provider') || '',
    callbackUrl: params.get('callbackUrl') || ''
  };
}

function normalizeCallbackUrl(value: string): string {
  if (!value) return '';

  try {
    return new URL(value).toString();
  } catch {
    return '';
  }
}

function readEncodedRequest(): SessionApprovalRequest | null {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  const encoded = params.get('request');
  if (!encoded) return null;

  try {
    return decodeSessionApprovalRequest(encoded);
  } catch {
    return null;
  }
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function App() {
  const fallback = readFallbackParams();
  const request = useMemo(() => readEncodedRequest(), []);
  const callbackUrl = useMemo(() => normalizeCallbackUrl(fallback.callbackUrl), [fallback.callbackUrl]);
  const [walletAddress, setWalletAddress] = useState('');
  const [ownerAddress, setOwnerAddress] = useState('');
  const [sessionAddress, setSessionAddress] = useState('');
  const [sessionPrivateKey, setSessionPrivateKey] = useState('');
  const [validatorAddress, setValidatorAddress] = useState('');
  const [paymasterAddress, setPaymasterAddress] = useState('');
  const [paymasterToken, setPaymasterToken] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [submitStatus, setSubmitStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const approvedPayload = useMemo(() => {
    if (!request || !walletAddress) return null;

    try {
      return buildApprovedSessionPayload({
        request,
        walletAddress,
        ownerAddress: ownerAddress || undefined,
        sessionAddress: sessionAddress || undefined,
        sessionPrivateKey: sessionPrivateKey || undefined,
        validatorAddress: validatorAddress || undefined,
        paymasterAddress: paymasterAddress || undefined,
        paymasterToken: paymasterToken || undefined,
        connectorOrigin: window.location.origin,
        connectorUrl: `${window.location.origin}${window.location.pathname}`
      });
    } catch {
      return null;
    }
  }, [
    ownerAddress,
    paymasterAddress,
    paymasterToken,
    request,
    sessionAddress,
    sessionPrivateKey,
    validatorAddress,
    walletAddress
  ]);

  const generatedPayload = useMemo(() => {
    if (!approvedPayload) return '';
    return JSON.stringify(approvedPayload, null, 2);
  }, [approvedPayload]);

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">zk-agent connector</p>
        <h1>Session approval draft</h1>
        <p className="lede">
          This screen now understands a locally encoded approval request and can generate an
          importable session payload for the CLI. It is still a local draft flow, not a real relay.
        </p>

        <dl className="meta">
          <div>
            <dt>Protocol</dt>
            <dd>{PROTOCOL_VERSION}</dd>
          </div>
          <div>
            <dt>Request ID</dt>
            <dd>{request?.requestId || fallback.rid || 'n/a'}</dd>
          </div>
          <div>
            <dt>Wallet</dt>
            <dd>{request?.walletName || fallback.wallet || 'n/a'}</dd>
          </div>
          <div>
            <dt>Chain</dt>
            <dd>{request?.chain || fallback.chain || 'n/a'}</dd>
          </div>
          <div>
            <dt>Chain ID</dt>
            <dd>{request?.chainId || fallback.chainId || 'n/a'}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{request?.provider || fallback.provider || 'n/a'}</dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd>{request?.requestedAccountKind || 'n/a'}</dd>
          </div>
          <div>
            <dt>Paymaster</dt>
            <dd>{request?.requestedPaymasterMode || 'n/a'}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>{request?.expiresAt || 'n/a'}</dd>
          </div>
        </dl>

        {request ? (
          <>
            <section className="panel">
              <h2>Requested capabilities</h2>
              <div className="chip-row">
                <span className="chip">read: {String(request.requestedCapabilities.read)}</span>
                <span className="chip">write: {String(request.requestedCapabilities.write)}</span>
                <span className="chip">transfer: {String(request.requestedCapabilities.transfer)}</span>
                <span className="chip">call: {String(request.requestedCapabilities.contractCall)}</span>
                <span className="chip">paymaster: {String(request.requestedCapabilities.paymaster)}</span>
              </div>
            </section>

            <section className="panel">
              <h2>Approve and generate session payload</h2>
              <div className="form-grid">
                <label>
                  <span>Wallet address</span>
                  <input
                    value={walletAddress}
                    onChange={(event) => setWalletAddress(event.target.value.trim())}
                    placeholder="0x..."
                  />
                </label>
                <label>
                  <span>Owner address</span>
                  <input
                    value={ownerAddress}
                    onChange={(event) => setOwnerAddress(event.target.value.trim())}
                    placeholder="Optional 0x... if session private key is provided"
                  />
                </label>
                <label>
                  <span>Session address</span>
                  <input
                    value={sessionAddress}
                    onChange={(event) => setSessionAddress(event.target.value.trim())}
                    placeholder="Optional 0x..."
                  />
                </label>
                <label>
                  <span>Session private key</span>
                  <input
                    value={sessionPrivateKey}
                    onChange={(event) => setSessionPrivateKey(event.target.value.trim())}
                    placeholder="Optional 0x... for writable testnet sessions"
                  />
                </label>
                <label>
                  <span>Validator address</span>
                  <input
                    value={validatorAddress}
                    onChange={(event) => setValidatorAddress(event.target.value.trim())}
                    placeholder="Optional 0x..."
                  />
                </label>
                <label>
                  <span>Paymaster address</span>
                  <input
                    value={paymasterAddress}
                    onChange={(event) => setPaymasterAddress(event.target.value.trim())}
                    placeholder="Optional 0x..."
                  />
                </label>
                <label>
                  <span>Paymaster token</span>
                  <input
                    value={paymasterToken}
                    onChange={(event) => setPaymasterToken(event.target.value.trim())}
                    placeholder="Optional 0x... for approval-based mode"
                  />
                </label>
              </div>
              <p className="helper">
                {callbackUrl
                  ? 'Approve in the connector to return the session directly to the waiting CLI process. Copy payload remains available as a fallback.'
                  : 'Paste the generated JSON into the CLI with `zk-agent wallet import --payload ...`.'}
              </p>
              <textarea
                className="payload"
                readOnly
                value={
                  generatedPayload ||
                  'Enter a valid wallet address and, for smart-account approval, either an owner address or a session private key.'
                }
              />
              <div className="actions">
                {callbackUrl ? (
                  <button
                    type="button"
                    disabled={!approvedPayload || isSubmitting}
                    onClick={async () => {
                      if (!request || !approvedPayload || !callbackUrl) return;

                      setIsSubmitting(true);
                      setSubmitStatus('');

                      try {
                        const response = await fetch(callbackUrl, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                            requestId: request.requestId,
                            payload: approvedPayload
                          })
                        });

                        const body = (await response.json().catch(() => null)) as
                          | { error?: string; wallet?: { walletName?: string } }
                          | null;

                        if (!response.ok) {
                          throw new Error(
                            body?.error ||
                              `Local approval callback failed with status ${response.status}`
                          );
                        }

                        const approvedWalletName = body?.wallet?.walletName;
                        setSubmitStatus(
                          approvedWalletName
                            ? `Approved and returned to CLI for wallet ${approvedWalletName}.`
                            : 'Approved and returned to the waiting CLI process.'
                        );
                      } catch (error) {
                        setSubmitStatus(
                          error instanceof Error ? error.message : 'Failed to return approval to CLI.'
                        );
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                  >
                    {isSubmitting ? 'Approving...' : 'Approve In CLI'}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!generatedPayload}
                  onClick={async () => {
                    const ok = await copyText(generatedPayload);
                    setCopyStatus(ok ? 'Payload copied to clipboard.' : 'Clipboard copy failed.');
                  }}
                >
                  Copy payload
                </button>
                {copyStatus ? <p className="status">{copyStatus}</p> : null}
                {submitStatus ? <p className="status">{submitStatus}</p> : null}
              </div>
            </section>
          </>
        ) : (
          <div className="callout">
            This page did not receive an encoded request payload in the URL hash. The fallback query
            params are visible above, but full approval generation needs the `request=...` fragment
            produced by `zk-agent wallet create`.
          </div>
        )}
      </section>
    </main>
  );
}
