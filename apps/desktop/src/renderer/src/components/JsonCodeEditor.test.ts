// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import JsonCodeEditor from "./JsonCodeEditor.vue";

describe("JsonCodeEditor", () => {
  it("syntax-highlights cURL commands", async () => {
    const wrapper = mount(JsonCodeEditor, {
      attachTo: document.body,
      props: {
        modelValue: "curl 'https://example.test/items' -H 'accept: application/json' --data-raw '{\"name\":\"Momo\"}'",
        language: "curl",
        title: "Browser cURL"
      }
    });

    expect(wrapper.find(".tok-curl-command").text()).toBe("curl");
    expect(wrapper.findAll(".tok-curl-option").map((token) => token.text())).toEqual(["-H", "--data-raw"]);
    expect(wrapper.findAll(".tok-curl-string").length).toBeGreaterThanOrEqual(3);
    wrapper.unmount();
  });
});
