import { createElement } from "@lwc/engine-dom";
import View360Softphone from "c/view360Softphone";
import { subscribe } from "lightning/messageService";
import VIEW360_DIALER_CHANNEL from "@salesforce/messageChannel/View360DialerChannel__c";

describe("c-view360-softphone", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("renders iframe with default hosted URL and accessible title", () => {
    const element = createElement("c-view360-softphone", {
      is: View360Softphone
    });
    document.body.appendChild(element);

    const iframe = element.shadowRoot.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe.src).toBe("https://syscare.systech.ae/v1/auth/login");
    expect(iframe.title).toBe("View360 Softphone");
  });

  it("displays loading spinner while iframe is loading", () => {
    const element = createElement("c-view360-softphone", {
      is: View360Softphone
    });
    document.body.appendChild(element);

    const spinner = element.shadowRoot.querySelector("lightning-spinner");
    expect(spinner).not.toBeNull();
  });

  it("hides spinner when iframe finishes loading", () => {
    const element = createElement("c-view360-softphone", {
      is: View360Softphone
    });
    document.body.appendChild(element);

    const iframe = element.shadowRoot.querySelector("iframe");
    iframe.dispatchEvent(new CustomEvent("load"));

    return Promise.resolve().then(() => {
      const spinner = element.shadowRoot.querySelector("lightning-spinner");
      expect(spinner).toBeNull();
    });
  });

  it("displays validation error if an insecure HTTP URL is provided", () => {
    const element = createElement("c-view360-softphone", {
      is: View360Softphone
    });
    element.softphoneUrl = "http://insecure-domain.com/softphone";
    document.body.appendChild(element);

    return Promise.resolve().then(() => {
      const errorMessage = element.shadowRoot.querySelector(".error-message");
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toContain("Insecure URL");
      const iframe = element.shadowRoot.querySelector("iframe");
      expect(iframe).toBeNull();
    });
  });

  it("displays error if softphoneUrl is empty", () => {
    const element = createElement("c-view360-softphone", {
      is: View360Softphone
    });
    element.softphoneUrl = "";
    document.body.appendChild(element);

    return Promise.resolve().then(() => {
      const errorMessage = element.shadowRoot.querySelector(".error-message");
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toContain(
        "Softphone URL is not configured"
      );
      const iframe = element.shadowRoot.querySelector("iframe");
      expect(iframe).toBeNull();
    });
  });

  // ==========================================
  // STAGE 1: SECURE IFRAME MESSAGING TESTS
  // ==========================================
  describe("Secure postMessage validation", () => {
    it("rejects messages originating from an untrusted origin", () => {
      const element = createElement("c-view360-softphone", {
        is: View360Softphone
      });
      document.body.appendChild(element);

      const iframe = element.shadowRoot.querySelector("iframe");
      iframe.dispatchEvent(new CustomEvent("load"));

      // Send message from attacker origin
      const untrustedEvent = new MessageEvent("message", {
        origin: "https://malicious-attacker.com",
        source: iframe.contentWindow,
        data: {
          type: "call_event",
          payload: { phone: "+15551234567" }
        }
      });
      window.dispatchEvent(untrustedEvent);

      return Promise.resolve().then(() => {
        // Call banner should NOT appear
        const banner = element.shadowRoot.querySelector(
          ".call-banner-incoming"
        );
        expect(banner).toBeNull();
        expect(element.isCallActive).toBeFalsy();
      });
    });

    it("rejects messages if source does not match iframe contentWindow", () => {
      const element = createElement("c-view360-softphone", {
        is: View360Softphone
      });
      document.body.appendChild(element);

      // Mock a different window as source
      const fakeWindow = {};
      const fakeSourceEvent = new MessageEvent("message", {
        origin: "https://syscare.systech.ae",
        source: fakeWindow,
        data: {
          type: "call_event",
          payload: { phone: "+15551234567" }
        }
      });
      window.dispatchEvent(fakeSourceEvent);

      return Promise.resolve().then(() => {
        const banner = element.shadowRoot.querySelector(
          ".call-banner-incoming"
        );
        expect(banner).toBeNull();
      });
    });

    it("rejects messages with unknown or unauthorized message types", () => {
      const element = createElement("c-view360-softphone", {
        is: View360Softphone
      });
      document.body.appendChild(element);

      const iframe = element.shadowRoot.querySelector("iframe");
      const invalidTypeEvent = new MessageEvent("message", {
        origin: "https://syscare.systech.ae",
        source: iframe.contentWindow,
        data: {
          type: "unauthorized_admin_eval",
          payload: { command: "alert(1)" }
        }
      });
      window.dispatchEvent(invalidTypeEvent);

      return Promise.resolve().then(() => {
        const banner = element.shadowRoot.querySelector(
          ".call-banner-incoming"
        );
        expect(banner).toBeNull();
      });
    });

    it("safely ignores malformed string messages without throwing errors", () => {
      const element = createElement("c-view360-softphone", {
        is: View360Softphone
      });
      document.body.appendChild(element);

      const iframe = element.shadowRoot.querySelector("iframe");
      const malformedEvent = new MessageEvent("message", {
        origin: "https://syscare.systech.ae",
        source: iframe.contentWindow,
        data: "{ invalid json %$#@ }"
      });

      expect(() => {
        window.dispatchEvent(malformedEvent);
      }).not.toThrow();
    });
  });

  // ==========================================
  // STAGE 2: LIGHTNING MESSAGE SERVICE CLICK-TO-DIAL TESTS
  // ==========================================
  describe("Click-to-Dial LMS integration", () => {
    it("subscribes to View360DialerChannel on connect and handles dial requests", () => {
      const element = createElement("c-view360-softphone", {
        is: View360Softphone
      });
      document.body.appendChild(element);

      expect(subscribe).toHaveBeenCalled();
      expect(subscribe.mock.calls[0][1]).toBe(VIEW360_DIALER_CHANNEL);

      // Mock iframe.contentWindow.postMessage
      const iframe = element.shadowRoot.querySelector("iframe");
      iframe.contentWindow.postMessage = jest.fn();

      // Simulate LMS message delivery by invoking the subscription callback
      const subscriptionCallback = subscribe.mock.calls[0][2];
      subscriptionCallback({
        phoneNumber: "+15559876543",
        recordId: "003dN00000abc123",
        recordName: "Alice Johnson",
        objectApiName: "Contact"
      });

      return Promise.resolve().then(() => {
        // Verify postMessage called with exact View360 payload and strict targetOrigin
        expect(iframe.contentWindow.postMessage).toHaveBeenCalledTimes(1);
        expect(iframe.contentWindow.postMessage).toHaveBeenCalledWith(
          {
            type: "click_to_call",
            payload: {
              phone: "+15559876543",
              recordId: "003dN00000abc123",
              recordName: "Alice Johnson"
            }
          },
          "https://syscare.systech.ae"
        );

        // Verify UI state updated for outbound call
        const callPill = element.shadowRoot.querySelector(".active-call-pill");
        expect(callPill).not.toBeNull();
      });
    });

    it("does not send postMessage if phone number is empty or whitespace", () => {
      const element = createElement("c-view360-softphone", {
        is: View360Softphone
      });
      document.body.appendChild(element);

      const iframe = element.shadowRoot.querySelector("iframe");
      iframe.contentWindow.postMessage = jest.fn();

      const subscriptionCallback = subscribe.mock.calls[0][2];
      subscriptionCallback({
        phoneNumber: "   ",
        recordId: "003dN00000abc123",
        recordName: "Alice Johnson"
      });

      expect(iframe.contentWindow.postMessage).not.toHaveBeenCalled();
    });
  });
});
