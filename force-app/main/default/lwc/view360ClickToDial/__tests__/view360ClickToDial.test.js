import { createElement } from "@lwc/engine-dom";
import View360ClickToDial from "c/view360ClickToDial";
import { getRecord } from "lightning/uiRecordApi";
import { publish } from "lightning/messageService";
import VIEW360_DIALER_CHANNEL from "@salesforce/messageChannel/View360DialerChannel__c";

const mockContactData = {
  id: "003dN00000abc123",
  fields: {
    Name: { value: "John Smith" },
    Phone: { value: "+15551234567" },
    MobilePhone: { value: "+15559876543" },
    HomePhone: { value: null }
  }
};

const mockEmptyContact = {
  id: "003dN00000empty1",
  fields: {
    Name: { value: "No Phone Person" },
    Phone: { value: null },
    MobilePhone: { value: null },
    HomePhone: { value: null }
  }
};

describe("c-view360-click-to-dial", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("renders contact phone numbers and publishes click-to-dial on call button click", async () => {
    const element = createElement("c-view360-click-to-dial", {
      is: View360ClickToDial
    });
    element.recordId = "003dN00000abc123";
    element.objectApiName = "Contact";
    document.body.appendChild(element);

    // Emit record data via getRecord wire adapter
    getRecord.emit(mockContactData);
    await Promise.resolve();

    // Check rendered phone numbers
    const phoneItems = element.shadowRoot.querySelectorAll(".phone-row");
    expect(phoneItems.length).toBe(2);

    // Click Call button for the first number
    const callBtn = element.shadowRoot.querySelector(
      "lightning-button.call-btn"
    );
    expect(callBtn).not.toBeNull();
    callBtn.click();

    // Verify publish was invoked with exact channel and payload
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(undefined, VIEW360_DIALER_CHANNEL, {
      phoneNumber: "+15551234567",
      recordId: "003dN00000abc123",
      recordName: "John Smith",
      objectApiName: "Contact"
    });

    // Verify status notification
    await Promise.resolve();
    const notification = element.shadowRoot.querySelector(
      ".slds-scoped-notification"
    );
    expect(notification).not.toBeNull();
    expect(notification.textContent).toContain("+15551234567");
  });

  it("allows dialing a custom phone number via input field", async () => {
    const element = createElement("c-view360-click-to-dial", {
      is: View360ClickToDial
    });
    element.recordId = "003dN00000abc123";
    element.objectApiName = "Contact";
    document.body.appendChild(element);

    getRecord.emit(mockContactData);
    await Promise.resolve();

    const input = element.shadowRoot.querySelector("lightning-input");
    input.value = "+18005550199";
    input.dispatchEvent(new CustomEvent("change"));

    const dialCustomBtn =
      element.shadowRoot.querySelectorAll("lightning-button")[2];
    dialCustomBtn.click();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(undefined, VIEW360_DIALER_CHANNEL, {
      phoneNumber: "+18005550199",
      recordId: "003dN00000abc123",
      recordName: "John Smith",
      objectApiName: "Contact"
    });
  });

  it("displays fallback message when record has no phone numbers", async () => {
    const element = createElement("c-view360-click-to-dial", {
      is: View360ClickToDial
    });
    element.recordId = "003dN00000empty1";
    element.objectApiName = "Contact";
    document.body.appendChild(element);

    getRecord.emit(mockEmptyContact);
    await Promise.resolve();

    const phoneItems = element.shadowRoot.querySelectorAll(".phone-row");
    expect(phoneItems.length).toBe(0);

    const emptyMessage = element.shadowRoot.querySelector(
      ".slds-text-color_weak"
    );
    expect(emptyMessage).not.toBeNull();
    expect(emptyMessage.textContent).toContain("No phone numbers found");
  });
});
