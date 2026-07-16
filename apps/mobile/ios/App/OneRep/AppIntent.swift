//
//  AppIntent.swift
//  OneRep
//
//  Created by Anantha Halmuttur on 16.07.26.
//

import WidgetKit
import AppIntents

struct ConfigurationAppIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Configuration" }
    static var description: IntentDescription { "This is an example widget." }
}
