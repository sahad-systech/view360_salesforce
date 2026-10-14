import { LightningElement, api, wire, track } from "lwc";
import { getRecord, getFieldValue } from "lightning/uiRecordApi";
import { publish, MessageContext } from "lightning/messageService";
import VIEW360_DIALER_CHANNEL from "@salesforce/messageChannel/View360DialerChannel__c";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

import CONTACT_NAME from "@salesforce/schema/Contact.Name";
import CONTACT_PHONE from "@salesforce/schema/Contact.Phone";
import CONTACT_MOBILE from "@salesforce/schema/Contact.MobilePhone";
import CONTACT_HOME from "@salesforce/schema/Contact.HomePhone";

import LEAD_NAME from "@salesforce/schema/Lead.Name";
import LEAD_PHONE from "@salesforce/schema/Lead.Phone";
import LEAD_MOBILE from "@salesforce/schema/Lead.MobilePhone";

export default class View360ClickToDial extends LightningElement {
  @api recordId;
  @api objectApiName;

  @track customNumber = "";
  @track lastDialedStatus = "";
  @track errorMessage = "";

  @wire(MessageContext)
  messageContext;

  get recordFields() {
    if (this.objectApiName === "Lead") {
      return [LEAD_NAME, LEAD_PHONE, LEAD_MOBILE];
    }
    return [CONTACT_NAME, CONTACT_PHONE, CONTACT_MOBILE, CONTACT_HOME];
  }

  @wire(getRecord, { recordId: "$recordId", fields: "$recordFields" })
  recordWire({ error, data }) {
    if (data) {
      this.recordData = data;
      this.errorMessage = "";
    } else if (error) {
      this.errorMessage = error.body
        ? error.body.message
        : "Error loading record data.";
      this.recordData = null;
    }
  }

  recordData = null;

  get isLoading() {
    return !this.recordData && !this.errorMessage;
  }

  get recordName() {
    if (!this.recordData) return "";
    if (this.objectApiName === "Lead") {
      return getFieldValue(this.recordData, LEAD_NAME) || "";
    }
    return getFieldValue(this.recordData, CONTACT_NAME) || "";
  }

  get phoneList() {
    if (!this.recordData) return [];
    const list = [];

    if (this.objectApiName === "Lead") {
      const phone = getFieldValue(this.recordData, LEAD_PHONE);
      const mobile = getFieldValue(this.recordData, LEAD_MOBILE);
      if (phone) list.push({ label: "Phone", value: phone });
      if (mobile) list.push({ label: "Mobile", value: mobile });
    } else {
      const phone = getFieldValue(this.recordData, CONTACT_PHONE);
      const mobile = getFieldValue(this.recordData, CONTACT_MOBILE);
      const home = getFieldValue(this.recordData, CONTACT_HOME);
      if (phone) list.push({ label: "Business", value: phone });
      if (mobile) list.push({ label: "Mobile", value: mobile });
      if (home) list.push({ label: "Home", value: home });
    }

    return list;
  }

  get hasPhoneNumbers() {
    return this.phoneList.length > 0;
  }

  get isCustomCallDisabled() {
    return !this.customNumber || this.customNumber.trim().length < 3;
  }

  handleCustomNumberChange(event) {
    this.customNumber = event.target.value;
  }

  handleCallClick(event) {
    const phone = event.currentTarget.dataset.phone;
    if (phone) {
      this.dialPhoneNumber(phone);
    }
  }

  handleCustomCall() {
    if (this.customNumber && this.customNumber.trim()) {
      this.dialPhoneNumber(this.customNumber.trim());
    }
  }

  dialPhoneNumber(phoneNumber) {
    const payload = {
      phoneNumber: phoneNumber,
      recordId: this.recordId,
      recordName: this.recordName,
      objectApiName: this.objectApiName
    };

    try {
      publish(this.messageContext, VIEW360_DIALER_CHANNEL, payload);

      const toastMsg = `Calling ${this.recordName || phoneNumber} via View360 Softphone...`;
      this.lastDialedStatus = `Dialed ${phoneNumber} at ${new Date().toLocaleTimeString()}`;

      this.dispatchEvent(
        new ShowToastEvent({
          title: "View360 Click-to-Dial",
          message: toastMsg,
          variant: "success"
        })
      );
    } catch (err) {
      this.dispatchEvent(
        new ShowToastEvent({
          title: "Call Error",
          message:
            "Could not send call command to softphone: " + (err.message || err),
          variant: "error"
        })
      );
    }
  }
}
