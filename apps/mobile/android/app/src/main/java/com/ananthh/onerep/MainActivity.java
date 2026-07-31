package com.ananthh.onerep;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins are not listed in capacitor.plugins.json, which
        // `cap sync` regenerates from node_modules, so register them here.
        registerPlugin(BillingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
