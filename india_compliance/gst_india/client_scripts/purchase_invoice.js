const DOCTYPE = "Purchase Invoice";
setup_e_waybill_actions(DOCTYPE);

frappe.ui.form.on(DOCTYPE, {
    setup(frm) {
        frm.set_query("transporter", {
            filters: {
                is_transporter: 1,
            },
        });

        frm.set_query("driver", doc => {
            return {
                filters: {
                    transporter: doc.transporter,
                },
            };
        });
    },

    onload: toggle_reverse_charge,

    gst_category: toggle_reverse_charge,

    after_save(frm) {
        if (
            frm.doc.supplier_address ||
            !(frm.doc.gst_category == "Unregistered" || frm.doc.is_return) ||
            !is_e_waybill_applicable(frm) ||
            !has_e_waybill_threshold_met(frm)
        )
            return;

        frappe.show_alert(
            {
                message: __("Supplier Address is required to create e-Waybill"),
                indicator: "yellow",
            },
            10
        );
    },

    refresh(frm) {
        india_compliance.set_reconciliation_status(frm, "bill_no");
        if (gst_settings.enable_e_waybill && gst_settings.enable_e_waybill_from_pi)
            show_sandbox_mode_indicator();

        if (
            frm.doc.docstatus !== 1 ||
            frm.doc.gst_category !== "Overseas" ||
            frm.doc.__onload?.bill_of_entry_exists
        )
            return;

        frm.add_custom_button(
            __("Bill of Entry"),
            () => {
                frappe.model.open_mapped_doc({
                    method: "india_compliance.gst_india.doctype.bill_of_entry.bill_of_entry.make_bill_of_entry",
                    frm: frm,
                });
            },
            __("Create")
        );
    },

    before_save: function (frm) {
        // hack: values set in frm.doc are not available after save
        if (frm._inward_supply) frm.doc._inward_supply = frm._inward_supply;
    },

    on_submit: function (frm) {
        if (!frm._inward_supply) return;

        // go back to previous page and match the invoice with the inward supply
        setTimeout(() => {
            frappe.route_hooks.after_load = reco_frm => {
                if (!reco_frm.purchase_reconciliation_tool) return;
                purchase_reconciliation_tool.link_documents(
                    reco_frm,
                    frm.doc.name,
                    frm._inward_supply.name,
                    "Purchase Invoice",
                    false
                );
            };
            frappe.set_route("Form", "Purchase Reconciliation Tool");
        }, 2000);
    },
});

frappe.ui.form.on("Purchase Invoice Item", {
    item_code: toggle_reverse_charge,

    items_remove: toggle_reverse_charge,
});

function toggle_reverse_charge(frm) {
    let is_read_only = 0;
    if (frm.doc.gst_category !== "Overseas") is_read_only = 0;
    // has_goods_item
    else if (frm.doc.items.some(item => !item.gst_hsn_code.startsWith("99")))
        is_read_only = 1;

    frm.set_df_property("is_reverse_charge", "read_only", is_read_only);
}
