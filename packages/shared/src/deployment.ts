export interface IpDeploymentUrls {
  appHost: string;
  signalHost: string;
  appUrl: string;
  cameraUrl: string;
  viewerUrl: string;
  signalingHttpUrl: string;
  signalingWsUrl: string;
}

const PRIVATE_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./
];

function assertPublicIpv4(publicIp: string): void {
  const parts = publicIp.split(".");
  const valid =
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^[0-9]+$/.test(part)) {
        return false;
      }
      const octet = Number(part);
      return octet >= 0 && octet <= 255 && String(octet) === part;
    });

  if (!valid || PRIVATE_RANGES.some((range) => range.test(publicIp))) {
    throw new Error("A public IPv4 address is required for HTTPS deployment");
  }
}

export function buildIpDeploymentUrls(
  publicIp: string,
  dnsSuffix = "sslip.io"
): IpDeploymentUrls {
  assertPublicIpv4(publicIp);
  const dashedIp = publicIp.replaceAll(".", "-");
  const appHost = `app-${dashedIp}.${dnsSuffix}`;
  const signalHost = `signal-${dashedIp}.${dnsSuffix}`;
  const appUrl = `https://${appHost}`;
  const signalingHttpUrl = `https://${signalHost}`;

  return {
    appHost,
    signalHost,
    appUrl,
    cameraUrl: `${appUrl}/?mode=camera`,
    viewerUrl: `${appUrl}/?mode=viewer`,
    signalingHttpUrl,
    signalingWsUrl: `wss://${signalHost}/ws`
  };
}

