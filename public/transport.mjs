// Lets bare-mux (which Scramjet 1.x uses) run libcurl-transport 2.x, the
// version with the fix for the compromised certificates. The two only differ
// in how headers are passed: bare-mux uses { name: value or [values] },
// libcurl-transport 2.x uses a list of [name, value] pairs.
import LibcurlClient from "/libcurl/index.mjs";

function toPairs(headers) {
  return Object.entries(headers).flatMap(([name, value]) =>
    Array.isArray(value) ? value.map((v) => [name, v]) : [[name, value]]
  );
}

export default class Transport extends LibcurlClient {
  async request(remote, method, body, headers, signal) {
    const response = await super.request(remote, method, body, toPairs(headers), signal);
    const grouped = {};
    for (const [name, value] of response.headers) (grouped[name] ??= []).push(value);
    return { ...response, headers: grouped };
  }

  connect(url, protocols, headers, onopen, onmessage, onclose, onerror) {
    return super.connect(url, protocols, toPairs(headers), (protocol) => onopen(protocol), onmessage, onclose, onerror);
  }
}
